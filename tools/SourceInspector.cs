using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Web.Script.Serialization;

// Reads only the ASAR header and selected source entries. Does not load or run app code.
class SourceInspector {
    static byte[] ReadBytes(Stream s,int count){
        var buffer=new byte[count];int at=0;
        while(at<count){int n=s.Read(buffer,at,count-at);if(n==0)throw new EndOfStreamException();at+=n;}
        return buffer;
    }
    static Dictionary<string,object> Map(object value){return (Dictionary<string,object>)value;}
    static string FindAsar(){
        var paths=new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach(var window in NativeProcess.FindCodexWindows())paths.Add(Path.Combine(Path.GetDirectoryName(window.Process.ImagePath),"resources","app.asar"));
        if(paths.Count!=1)throw new Exception("Expected one running Codex installation. Specify an app.asar path explicitly.");
        foreach(var path in paths)return path;
        throw new Exception("Codex installation not found");
    }
    static int Main(string[] args){
        try{
            Console.OutputEncoding=new UTF8Encoding(false);
            if(args.Length==1&&args[0].StartsWith("--identity=")){
                Console.WriteLine(new JavaScriptSerializer().Serialize(NativeProcess.Read(uint.Parse(args[0].Substring(11)))));return 0;
            }
            string path=Path.GetFullPath(args.Length>0?args[0]:FindAsar());
            var json=new JavaScriptSerializer{MaxJsonLength=16777216,RecursionLimit=1024};
            var snippets=new List<object>();var examined=new List<string>();
            using(var stream=File.Open(path,FileMode.Open,FileAccess.Read,FileShare.ReadWrite)){
                var prefix=ReadBytes(stream,16);uint headerSize=BitConverter.ToUInt32(prefix,12);
                if(headerSize>16777216)throw new Exception("ASAR header exceeds 16 MiB diagnostic limit");
                var header=Map(json.DeserializeObject(Encoding.UTF8.GetString(ReadBytes(stream,(int)headerSize))));
                long dataOffset=8L+BitConverter.ToUInt32(prefix,4);
                var rootFiles=Map(header["files"]);
                var vite=Map(rootFiles[".vite"]);
                var viteFiles=Map(vite["files"]);
                var buildEntry=Map(viteFiles["build"]);
                var build=Map(buildEntry["files"]);
                foreach(var item in build){
                    if(item.Key!="early-bootstrap.js"&&!(item.Key.StartsWith("early-bootstrap-620-")&&item.Key.EndsWith(".js")))continue;
                    var entry=Map(item.Value);
                    if(entry.ContainsKey("unpacked")&&Convert.ToBoolean(entry["unpacked"]))continue;
                    int size=Convert.ToInt32(entry["size"]);if(size>33554432)throw new Exception("Source entry exceeds 32 MiB diagnostic limit");
                    stream.Position=dataOffset+Convert.ToInt64(entry["offset"]);
                    string text=Encoding.UTF8.GetString(ReadBytes(stream,size));string name=".vite/build/"+item.Key;examined.Add(name);
                    foreach(string token in new[]{"regex(/^#[0-9a-fA-F]{6}$/)","opaqueWindows","backgroundMaterial","appearanceLightChromeTheme","appearanceDarkChromeTheme"}){
                        int at=text.IndexOf(token,StringComparison.Ordinal);if(at<0)continue;
                        int start=Math.Max(0,at-100);int length=Math.Min(450,text.Length-start);
                        snippets.Add(new{file=name,token=token,stringOffset=at,context=text.Substring(start,length)});
                    }
                }
            }
            Console.WriteLine(json.Serialize(new{asarPath=path,readOnly=true,examinedFiles=examined,snippets=snippets,note="Token matches locate source only. Missing tokens do not prove missing features. No archive code is executed."}));
            return 0;
        }catch(Exception ex){Console.Error.WriteLine(ex.Message);return 1;}
    }
}
