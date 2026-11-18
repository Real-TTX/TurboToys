using System.Reflection;
using TurboToys.Local;
using MatGame.Shell;

namespace TurboToys.App;

internal static class Program
{
    [STAThread]
    private static int Main(string[] args) => ShellApp.Run(args, new ShellOptions
    {
        GameId = "turbotoys",
        Title = "TurboToys",
        DefaultServer = typeof(Program).Assembly.GetCustomAttributes<AssemblyMetadataAttribute>().FirstOrDefault(a => a.Key == "MatGameDefaultServer")?.Value,
        Repository = "Real-TTX/TurboToys",
        LocalGame = () => new TurboToysLocal(),
        Background = Color.FromArgb(0x14, 0x10, 0x0c),
    });
}
