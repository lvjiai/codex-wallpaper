using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;

// OS-maintained identity only: PROCESS_QUERY_LIMITED_INFORMATION, never VM_READ/VM_WRITE.
static class NativeProcess {
    public class Snapshot { public uint Pid; public string ImagePath; public string CreatedUtc; }
    public class WindowInfo { public IntPtr Handle; public Snapshot Process; }
    delegate bool Callback(IntPtr h,IntPtr l);
    [StructLayout(LayoutKind.Sequential)] struct Rect {public int Left,Top,Right,Bottom;}
    [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr OpenProcess(uint access,bool inherit,uint pid);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool QueryFullProcessImageName(IntPtr process,uint flags,StringBuilder path,ref uint size);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetProcessTimes(IntPtr process,out long created,out long exited,out long kernel,out long user);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
    [DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr h,uint milliseconds);
    [DllImport("user32.dll")] static extern bool EnumWindows(Callback callback,IntPtr parameter);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h,out Rect rect);
    [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr h,StringBuilder name,int length);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
    public static Snapshot Read(uint pid){
        IntPtr h=OpenProcess(0x1000,false,pid);if(h==IntPtr.Zero)throw new Win32Exception(Marshal.GetLastWin32Error());
        try{
            uint count=32768;var path=new StringBuilder((int)count);
            if(!QueryFullProcessImageName(h,0,path,ref count))throw new Win32Exception(Marshal.GetLastWin32Error());
            long created,exited,kernel,user;if(!GetProcessTimes(h,out created,out exited,out kernel,out user))throw new Win32Exception(Marshal.GetLastWin32Error());
            return new Snapshot{Pid=pid,ImagePath=path.ToString(),CreatedUtc=DateTime.FromFileTimeUtc(created).ToString("o")};
        }finally{CloseHandle(h);}
    }
    public static bool IsCodexImage(string path){
        return Regex.IsMatch(path,@"^[A-Za-z]:\\(?:[^\\]+\\)*WindowsApps\\OpenAI\.Codex_[^\\]+__2p2nqsd0c76g0\\app\\ChatGPT\.exe$",RegexOptions.IgnoreCase|RegexOptions.CultureInvariant);
    }
    public static List<WindowInfo> FindCodexWindows(){
        var windows=new List<WindowInfo>();
        EnumWindows(delegate(IntPtr h,IntPtr unused){
            if(!IsWindowVisible(h))return true;
            var name=new StringBuilder(256);GetClassName(h,name,name.Capacity);if(name.ToString()!="Chrome_WidgetWin_1")return true;
            uint pid;GetWindowThreadProcessId(h,out pid);
            try{var process=Read(pid);if(IsCodexImage(process.ImagePath))windows.Add(new WindowInfo{Handle=h,Process=process});}catch(Win32Exception){}
            return true;
        },IntPtr.Zero);
        return windows;
    }
    public static void WaitForParent(uint pid,uint milliseconds){
        IntPtr h=OpenProcess(0x00100000,false,pid);if(h==IntPtr.Zero)return;
        try{WaitForSingleObject(h,milliseconds);}finally{CloseHandle(h);}
    }
}
