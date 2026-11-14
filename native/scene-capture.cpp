#define NOMINMAX
#include <windows.h>
#include <d3d11.h>
#include <dxgi.h>
#include <dwmapi.h>
#include <wincodec.h>
#include <roapi.h>
#include <appmodel.h>
#include <ShObjIdl_core.h>
#include <windows.graphics.capture.interop.h>
#include <windows.graphics.directx.direct3d11.interop.h>
#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.Graphics.Capture.h>
#include <winrt/Windows.Graphics.DirectX.h>
#include <winrt/Windows.Graphics.DirectX.Direct3D11.h>
#include <chrono>
#include <atomic>
#include <mutex>
#include <vector>
#include <string>
#include <filesystem>
#include <fstream>
#include <sstream>
#include <algorithm>
#include <cstring>

using namespace winrt;
using namespace winrt::Windows::Graphics::Capture;
using namespace winrt::Windows::Graphics::DirectX;
using namespace winrt::Windows::Graphics::DirectX::Direct3D11;
namespace fs = std::filesystem;
struct WindowStyleGuard {
    HWND window{}; LONG_PTR original{}; bool changed = false;
    ~WindowStyleGuard() { if (changed && IsWindow(window)) SetWindowLongPtrW(window, GWL_EXSTYLE, original); }
};
static void diagnostic(const std::string& message) {
    DWORD count; auto line = message + "\n"; WriteFile(GetStdHandle(STD_ERROR_HANDLE), line.data(), static_cast<DWORD>(line.size()), &count, nullptr);
}

static bool write_all(HANDLE h, const void* data, DWORD count) {
    const auto* bytes = static_cast<const BYTE*>(data);
    while (count) { DWORD n = 0; if (!WriteFile(h, bytes, count, &n, nullptr) || !n) return false; bytes += n; count -= n; }
    return true;
}
static uint64_t pixel_hash(const D3D11_MAPPED_SUBRESOURCE& map, UINT width, UINT height) {
    uint64_t hash = 1469598103934665603ull;
    // Sparse pixel signature, ignoring GPU row padding.
    for (UINT y = 0; y < height; y += 5) for (UINT x = 0; x < width * 4; x += 13) {
        hash ^= static_cast<const BYTE*>(map.pData)[y * map.RowPitch + x]; hash *= 1099511628211ull;
    }
    return hash;
}
static bool has_picture(const D3D11_MAPPED_SUBRESOURCE& map, UINT width, UINT height) {
    for (UINT y = 0; y < height; y += std::max(1u, height / 64)) {
        const auto* row = static_cast<const BYTE*>(map.pData) + static_cast<size_t>(y) * map.RowPitch;
        for (UINT x = 0; x < width; x += std::max(1u, width / 64)) {
            const auto* pixel = row + x * 4;
            if (std::max({ pixel[0], pixel[1], pixel[2] }) > 12) return true;
        }
    }
    return false;
}
static std::vector<BYTE> jpeg(IWICImagingFactory* factory, const D3D11_MAPPED_SUBRESOURCE& map, UINT width, UINT height) {
    const UINT packed_stride = width * 4;
    std::vector<BYTE> pixels(static_cast<size_t>(packed_stride) * height);
    for (UINT row = 0; row < height; ++row) std::memcpy(pixels.data() + static_cast<size_t>(row) * packed_stride, static_cast<const BYTE*>(map.pData) + static_cast<size_t>(row) * map.RowPitch, packed_stride);
    com_ptr<IWICBitmap> bitmap;
    check_hresult(factory->CreateBitmapFromMemory(width, height, GUID_WICPixelFormat32bppBGRA, packed_stride, static_cast<UINT>(pixels.size()), pixels.data(), bitmap.put()));
    com_ptr<IWICFormatConverter> converter;
    check_hresult(factory->CreateFormatConverter(converter.put()));
    check_hresult(converter->Initialize(bitmap.get(), GUID_WICPixelFormat24bppBGR, WICBitmapDitherTypeNone, nullptr, 0, WICBitmapPaletteTypeCustom));
    com_ptr<IStream> stream; check_hresult(CreateStreamOnHGlobal(nullptr, TRUE, stream.put()));
    com_ptr<IWICBitmapEncoder> encoder; check_hresult(factory->CreateEncoder(GUID_ContainerFormatJpeg, nullptr, encoder.put()));
    check_hresult(encoder->Initialize(stream.get(), WICBitmapEncoderNoCache));
    com_ptr<IWICBitmapFrameEncode> frame; com_ptr<IPropertyBag2> properties;
    check_hresult(encoder->CreateNewFrame(frame.put(), properties.put()));
    PROPBAG2 property{}; property.pstrName = const_cast<LPOLESTR>(L"ImageQuality");
    VARIANT quality{}; quality.vt = VT_R4; quality.fltVal = 0.92f;
    check_hresult(properties->Write(1, &property, &quality));
    check_hresult(frame->Initialize(properties.get())); check_hresult(frame->SetSize(width, height));
    WICPixelFormatGUID format = GUID_WICPixelFormat24bppBGR; check_hresult(frame->SetPixelFormat(&format));
    check_hresult(frame->WriteSource(converter.get(), nullptr)); check_hresult(frame->Commit()); check_hresult(encoder->Commit());
    STATSTG stat{}; check_hresult(stream->Stat(&stat, STATFLAG_NONAME));
    HGLOBAL memory = nullptr; check_hresult(GetHGlobalFromStream(stream.get(), &memory));
    const auto* data = static_cast<const BYTE*>(GlobalLock(memory)); if (!data) throw_last_error();
    std::vector<BYTE> output(data, data + static_cast<size_t>(stat.cbSize.QuadPart)); GlobalUnlock(memory); return output;
}
static bool is_owned_scene(HWND window) {
    wchar_t title[512]{}; GetWindowTextW(window, title, 512);
    return std::wstring(title).find(L"CodexWallpaper-") != std::wstring::npos;
}
static HWND find_scene(const std::wstring& name) {
    struct Search { const std::wstring* name; HWND found{}; } search{ &name };
    EnumWindows([](HWND h, LPARAM data) -> BOOL {
        auto* state = reinterpret_cast<Search*>(data); wchar_t title[512]{}; GetWindowTextW(h, title, 512);
        if (std::wstring(title).find(*state->name) != std::wstring::npos && IsWindowVisible(h)) { state->found = h; return FALSE; }
        return TRUE;
    }, reinterpret_cast<LPARAM>(&search)); return search.found;
}
struct ConsentState { bool requested = false; bool cancelled = false; };
static LRESULT CALLBACK consent_proc(HWND window, UINT message, WPARAM wparam, LPARAM lparam) {
    auto* state = reinterpret_cast<ConsentState*>(GetWindowLongPtrW(window, GWLP_USERDATA));
    if (message == WM_NCCREATE) { state = static_cast<ConsentState*>(reinterpret_cast<CREATESTRUCTW*>(lparam)->lpCreateParams); SetWindowLongPtrW(window, GWLP_USERDATA, reinterpret_cast<LONG_PTR>(state)); }
    if (message == WM_COMMAND && LOWORD(wparam) == 1001 && state) { state->requested = true; EnableWindow(GetDlgItem(window, 1001), FALSE); return 0; }
    if (message == WM_CLOSE && state) { state->cancelled = true; DestroyWindow(window); return 0; }
    return DefWindowProcW(window, message, wparam, lparam);
}
static void pump_messages() {
    MSG message; while (PeekMessageW(&message, nullptr, 0, 0, PM_REMOVE)) { TranslateMessage(&message); DispatchMessageW(&message); }
}
static GraphicsCaptureItem pick_scene(const std::wstring& title, HWND host) {
    STARTUPINFOW startup{}; startup.cb = sizeof(startup); GetStartupInfoW(&startup);
    diagnostic("picker startupFlags=" + std::to_string(startup.dwFlags) + " startupShowWindow=" + std::to_string(startup.wShowWindow) + " thread=" + std::to_string(GetCurrentThreadId()));
    UINT32 package_length = 0; LONG package_result = GetCurrentPackageFullName(&package_length, nullptr);
    if (package_result == ERROR_INSUFFICIENT_BUFFER) {
        std::wstring package(package_length, L'\0'); if (GetCurrentPackageFullName(&package_length, package.data()) == ERROR_SUCCESS) { package.resize(package_length - 1); diagnostic("picker callerPackage=" + to_string(package)); }
    } else diagnostic("picker callerPackageQuery=" + std::to_string(package_result));
    WNDCLASSEXW window_class{}; window_class.cbSize = sizeof(window_class); window_class.hInstance = GetModuleHandleW(nullptr); window_class.lpfnWndProc = consent_proc;
    window_class.lpszClassName = L"CodexWallpaperCaptureConsent"; window_class.hCursor = LoadCursorW(nullptr, IDC_ARROW); window_class.hbrBackground = reinterpret_cast<HBRUSH>(COLOR_WINDOW + 1);
    if (!RegisterClassExW(&window_class) && GetLastError() != ERROR_CLASS_ALREADY_EXISTS) throw_last_error();
    ConsentState state;
    RECT host_bounds{};
    const bool has_host = host && GetWindowRect(host, &host_bounds);
    const int x = has_host ? host_bounds.left + (host_bounds.right - host_bounds.left - 720) / 2 : CW_USEDEFAULT;
    const int y = has_host ? host_bounds.top + (host_bounds.bottom - host_bounds.top - 230) / 2 : CW_USEDEFAULT;
    HWND owner = CreateWindowExW(WS_EX_TOOLWINDOW | WS_EX_TOPMOST, window_class.lpszClassName, L"Codex Wallpaper — 捕获授权验证", WS_OVERLAPPED | WS_CAPTION | WS_SYSMENU, x, y, 720, 230, nullptr, nullptr, window_class.hInstance, &state);
    if (!owner) throw_last_error();
    struct OwnerGuard { HWND value; ~OwnerGuard() { if (IsWindow(value)) DestroyWindow(value); } } guard{ owner };
    std::wstring prompt = L"点击下方按钮，然后在 Windows 选择器中只选择这个测试窗口：\n" + title;
    HWND label = CreateWindowExW(0, L"STATIC", prompt.c_str(), WS_CHILD | WS_VISIBLE, 22, 20, 665, 80, owner, nullptr, window_class.hInstance, nullptr);
    HWND button = CreateWindowExW(0, L"BUTTON", L"选择场景窗口…", WS_CHILD | WS_VISIBLE | WS_TABSTOP | BS_DEFPUSHBUTTON, 22, 116, 220, 42, owner, reinterpret_cast<HMENU>(1001), window_class.hInstance, nullptr);
    for (HWND control : { label, button }) SendMessageW(control, WM_SETFONT, reinterpret_cast<WPARAM>(GetStockObject(DEFAULT_GUI_FONT)), TRUE);
    // A hidden console launch may supply SW_HIDE for the first ShowWindow call.
    ShowWindow(owner, SW_SHOWNORMAL);
    SetWindowPos(owner, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW | SWP_NOACTIVATE);
    UpdateWindow(owner);
    diagnostic("picker ownerVisible=" + std::to_string(IsWindowVisible(owner)) + " ownerIconic=" + std::to_string(IsIconic(owner)) + " foregroundIsOwner=" + std::to_string(GetForegroundWindow() == owner));
    auto deadline = GetTickCount64() + 120000;
    while (!state.requested && !state.cancelled && IsWindow(owner) && GetTickCount64() < deadline) { pump_messages(); Sleep(15); }
    if (!state.requested) throw std::runtime_error(state.cancelled ? "Capture consent window was closed before starting selection" : "No selection was started before the consent-window timeout");
    diagnostic("picker userButtonActivated=1 ownerVisible=" + std::to_string(IsWindowVisible(owner)) + " foregroundIsOwner=" + std::to_string(GetForegroundWindow() == owner));
    SetWindowPos(owner, HWND_NOTOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
    GraphicsCapturePicker picker; check_hresult(picker.as<IInitializeWithWindow>()->Initialize(owner));
    auto started = GetTickCount64(); auto operation = picker.PickSingleItemAsync(); deadline = started + 120000;
    while (operation.Status() == winrt::Windows::Foundation::AsyncStatus::Started && GetTickCount64() < deadline) { pump_messages(); if (state.cancelled) { operation.Cancel(); break; } Sleep(15); }
    auto status = operation.Status();
    diagnostic("picker asyncStatus=" + std::to_string(static_cast<int>(status)) + " errorCode=" + std::to_string(static_cast<long>(operation.ErrorCode().value)) + " elapsedMs=" + std::to_string(GetTickCount64() - started));
    if (status == winrt::Windows::Foundation::AsyncStatus::Started) { operation.Cancel(); throw std::runtime_error("System capture picker timed out"); }
    if (status == winrt::Windows::Foundation::AsyncStatus::Canceled) throw std::runtime_error("System capture picker operation was cancelled");
    GraphicsCaptureItem item = operation.GetResults();
    if (!item) throw std::runtime_error("System picker completed with no capture item; this does not by itself prove an OS permission denial");
    if (std::wstring(item.DisplayName()).find(title) == std::wstring::npos) throw std::runtime_error("Selected window is not the dedicated CodexWallpaper scene");
    diagnostic("picker authorizedDedicatedScene=1"); return item;
}
int wmain(int argc, wchar_t** argv) {
    fs::path output; std::string stage = "arguments";
    try {
        std::wstring title; HWND target{}; HWND behind{}; int fps = 15, seconds = 0; bool pipe = false, pick = false;
        for (int i = 1; i < argc; ++i) {
            std::wstring flag = argv[i]; auto value = [&]() -> const wchar_t* { if (++i >= argc) throw std::runtime_error("missing argument value"); return argv[i]; };
            if (flag == L"--title") title = value();
            else if (flag == L"--hwnd") target = reinterpret_cast<HWND>(std::stoull(value()));
            else if (flag == L"--behind") behind = reinterpret_cast<HWND>(std::stoull(value()));
            else if (flag == L"--fps") fps = std::stoi(value());
            else if (flag == L"--seconds") seconds = std::stoi(value());
            else if (flag == L"--output") output = value();
            else if (flag == L"--pipe") pipe = true;
            else if (flag == L"--picker") pick = true;
            else throw std::runtime_error("unknown argument");
        }
        if (fps < 1 || fps > 60 || seconds < 0 || seconds > 3600) throw std::runtime_error("invalid capture rate or duration");
        if (!target && !title.empty()) for (int i = 0; i < 100 && !target; ++i) { target = find_scene(title); if (!target) Sleep(100); }
        if (!IsWindow(target) || !is_owned_scene(target)) throw std::runtime_error("Only a CodexWallpaper-named renderer may be captured");
        if (!output.empty()) fs::create_directories(output);
        SetProcessDPIAware(); init_apartment(pick ? apartment_type::single_threaded : apartment_type::multi_threaded);
        if (!GraphicsCaptureSession::IsSupported()) throw std::runtime_error("Windows Graphics Capture is not supported");
        GraphicsCaptureItem authorized_item{ nullptr };
        if (pick) {
            stage = "GraphicsCapturePicker";
            authorized_item = pick_scene(title, behind);
        }
        WindowStyleGuard style{ target, GetWindowLongPtrW(target, GWL_EXSTYLE), false };
        DWORD affinity = 0; BOOL affinity_readable = GetWindowDisplayAffinity(target, &affinity);
        wchar_t window_class[256]{}; GetClassNameW(target, window_class, 256);
        diagnostic("capture target class=" + to_string(window_class) + " originalExStyle=" + std::to_string(style.original) + " affinityReadable=" + std::to_string(affinity_readable) + " displayAffinity=" + std::to_string(affinity));
        stage = "D3D11CreateDevice";
        com_ptr<ID3D11Device> device; com_ptr<ID3D11DeviceContext> context;
        check_hresult(D3D11CreateDevice(nullptr, D3D_DRIVER_TYPE_HARDWARE, nullptr, D3D11_CREATE_DEVICE_BGRA_SUPPORT, nullptr, 0, D3D11_SDK_VERSION, device.put(), nullptr, context.put()));
        com_ptr<IDXGIDevice> dxgi = device.as<IDXGIDevice>(); com_ptr<IInspectable> wrapped;
        check_hresult(CreateDirect3D11DeviceFromDXGIDevice(dxgi.get(), wrapped.put()));
        auto winrt_device = wrapped.as<IDirect3DDevice>();
        stage = "CreateForWindow"; GraphicsCaptureItem item = authorized_item;
        if (!item) { auto interop = get_activation_factory<GraphicsCaptureItem, IGraphicsCaptureItemInterop>(); check_hresult(interop->CreateForWindow(target, guid_of<GraphicsCaptureItem>(), put_abi(item))); }
        stage = "CreateFreeThreaded"; auto size = item.Size(); auto pool = Direct3D11CaptureFramePool::CreateFreeThreaded(winrt_device, DirectXPixelFormat::B8G8R8A8UIntNormalized, 2, size);
        auto session = pool.CreateCaptureSession(item); session.IsCursorCaptureEnabled(false);
        com_ptr<IWICImagingFactory> factory; check_hresult(CoCreateInstance(CLSID_WICImagingFactory, nullptr, CLSCTX_INPROC_SERVER, IID_PPV_ARGS(factory.put())));
        com_ptr<ID3D11Texture2D> staging; D3D11_TEXTURE2D_DESC staging_desc{};
        std::mutex lock; std::atomic<bool> stopped{ false }; std::atomic<int> count{ 0 }, changed{ 0 };
        uint64_t previous_hash = 0; std::atomic<uint64_t> last{ 0 }; std::string error;
        auto started = GetTickCount64();
        auto token = pool.FrameArrived([&](auto const& sender, auto const&) {
            if (stopped) return;
            std::lock_guard<std::mutex> guard(lock);
            if (stopped) return;
            try {
                auto frame = sender.TryGetNextFrame(); if (!frame) return;
                auto now = GetTickCount64(); if (now - last < static_cast<uint64_t>(1000 / fps)) return; last = now;
                auto surface = frame.Surface().as<::Windows::Graphics::DirectX::Direct3D11::IDirect3DDxgiInterfaceAccess>();
                com_ptr<ID3D11Texture2D> texture; check_hresult(surface->GetInterface(IID_PPV_ARGS(texture.put())));
                D3D11_TEXTURE2D_DESC desc{}; texture->GetDesc(&desc);
                if (!staging || staging_desc.Width != desc.Width || staging_desc.Height != desc.Height) {
                    staging_desc = desc; staging_desc.Usage = D3D11_USAGE_STAGING; staging_desc.BindFlags = 0; staging_desc.MiscFlags = 0; staging_desc.CPUAccessFlags = D3D11_CPU_ACCESS_READ;
                    staging = nullptr; check_hresult(device->CreateTexture2D(&staging_desc, nullptr, staging.put()));
                }
                context->CopyResource(staging.get(), texture.get()); D3D11_MAPPED_SUBRESOURCE map{};
                frame.Close();
                check_hresult(context->Map(staging.get(), 0, D3D11_MAP_READ, 0, &map));
                std::vector<BYTE> bytes; uint64_t signature = 0;
                RECT client{}, bounds{}; POINT origin{}; UINT crop_left = 0, crop_top = 0, crop_width = desc.Width, crop_height = desc.Height;
                if (GetClientRect(target, &client) && ClientToScreen(target, &origin) && SUCCEEDED(DwmGetWindowAttribute(target, DWMWA_EXTENDED_FRAME_BOUNDS, &bounds, sizeof(bounds)))) {
                    crop_left = static_cast<UINT>(std::clamp(origin.x - bounds.left, 0L, static_cast<LONG>(desc.Width - 1)));
                    crop_top = static_cast<UINT>(std::clamp(origin.y - bounds.top, 0L, static_cast<LONG>(desc.Height - 1)));
                    crop_width = std::min(static_cast<UINT>(client.right - client.left), desc.Width - crop_left);
                    crop_height = std::min(static_cast<UINT>(client.bottom - client.top), desc.Height - crop_top);
                }
                auto cropped = map; cropped.pData = static_cast<BYTE*>(map.pData) + crop_top * map.RowPitch + crop_left * 4;
                try {
                    if (count == 0 && !has_picture(cropped, crop_width, crop_height)) {
                        context->Unmap(staging.get(), 0);
                        if (now - started >= 12000) {
                            error = "Wallpaper Engine returned only black frames";
                            stopped = true;
                        }
                        return;
                    }
                    signature = pixel_hash(cropped, crop_width, crop_height);
                    bytes = jpeg(factory.get(), cropped, crop_width, crop_height);
                }
                catch (...) { context->Unmap(staging.get(), 0); throw; }
                context->Unmap(staging.get(), 0);
                if (count > 0 && signature != previous_hash) ++changed; previous_hash = signature;
                int number = ++count;
                if (!output.empty() && number <= 12) { std::ostringstream name; name << "frame-" << number << ".jpg"; std::ofstream image(output / name.str(), std::ios::binary); image.write(reinterpret_cast<const char*>(bytes.data()), bytes.size()); }
                if (pipe) { uint32_t length = static_cast<uint32_t>(bytes.size()); HANDLE out = GetStdHandle(STD_OUTPUT_HANDLE); if (!write_all(out, &length, 4) || !write_all(out, bytes.data(), length)) stopped = true; }
            } catch (const hresult_error& e) { error = to_string(e.message()); stopped = true; }
            catch (const std::exception& e) { error = e.what(); stopped = true; }
        });
        stage = "StartCapture"; session.StartCapture();
        // Change only our dedicated renderer after Windows accepts its capture item.
        SetWindowLongPtrW(target, GWL_EXSTYLE, (style.original | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE) & ~WS_EX_APPWINDOW); style.changed = true;
        if (behind && IsWindow(behind)) SetWindowPos(target, behind, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_FRAMECHANGED);
        stage = "FrameArrived";
        while (!stopped && IsWindow(target) && (!seconds || GetTickCount64() - started < static_cast<uint64_t>(seconds) * 1000)) {
            if (pick) pump_messages();
            const auto last_frame = last.load();
            if (GetTickCount64() - (last_frame ? last_frame : started) > 15000) {
                std::lock_guard<std::mutex> guard(lock);
                if (GetTickCount64() - (last.load() ? last.load() : started) > 15000) {
                    error = "Wallpaper Engine stopped delivering scene frames";
                    stopped = true;
                }
            }
            Sleep(15);
        }
        stopped = true; pool.FrameArrived(token); session.Close(); pool.Close();
        { std::lock_guard<std::mutex> guard(lock); }
        std::ostringstream summary; summary << "{\"captureApi\":\"Windows.Graphics.Capture\",\"frames\":" << count << ",\"pixelChangedFrames\":" << changed << ",\"durationMs\":" << (GetTickCount64() - started) << ",\"requestedFps\":" << fps << ",\"hadError\":" << (error.empty() ? "false" : "true") << "}";
        if (!output.empty()) { std::ofstream result(output / "result.json"); result << summary.str(); }
        DWORD ignored; auto log = summary.str() + "\n"; WriteFile(GetStdHandle(STD_ERROR_HANDLE), log.data(), static_cast<DWORD>(log.size()), &ignored, nullptr);
        if (!error.empty()) diagnostic(error);
        return error.empty() && count > 0 ? 0 : 1;
    } catch (const hresult_error& e) { diagnostic("Capture error at " + stage + ": " + to_string(e.message()) + " hr=" + std::to_string(static_cast<long>(e.code().value))); return 1; }
    catch (const std::exception& e) { auto message = std::string(e.what()) + "\n"; DWORD n; WriteFile(GetStdHandle(STD_ERROR_HANDLE), message.data(), static_cast<DWORD>(message.size()), &n, nullptr); return 1; }
}
