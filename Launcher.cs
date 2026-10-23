using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Threading;
using System.Windows.Forms;

namespace MCContabil
{
    static class Program
    {
        [STAThread]
        static void Main()
        {
            string appDir = AppDomain.CurrentDomain.BaseDirectory;
            Directory.SetCurrentDirectory(appDir);

            // Check if server is responding on port 3000
            bool serverRunning = false;
            try
            {
                var req = (HttpWebRequest)WebRequest.Create("http://localhost:3000/api/clients");
                req.Timeout = 1500;
                using (var res = (HttpWebResponse)req.GetResponse())
                {
                    if (res.StatusCode == HttpStatusCode.OK) serverRunning = true;
                }
            }
            catch {}

            if (!serverRunning)
            {
                // Start node server.js silently
                var psi = new ProcessStartInfo
                {
                    FileName = "node.exe",
                    Arguments = "server.js",
                    WorkingDirectory = appDir,
                    CreateNoWindow = true,
                    UseShellExecute = false,
                    WindowStyle = ProcessWindowStyle.Hidden
                };

                try
                {
                    Process.Start(psi);
                }
                catch (Exception ex)
                {
                    MessageBox.Show("Erro ao iniciar servidor do MC Contábil:\n" + ex.Message + "\n\nVerifique se o Node.js está instalado.", 
                        "MC Contábil - Erro", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return;
                }

                // Wait up to 15 seconds for server to respond
                for (int i = 0; i < 30; i++)
                {
                    Thread.Sleep(500);
                    try
                    {
                        var req = (HttpWebRequest)WebRequest.Create("http://localhost:3000/api/clients");
                        req.Timeout = 1000;
                        using (var res = (HttpWebResponse)req.GetResponse())
                        {
                            if (res.StatusCode == HttpStatusCode.OK) { serverRunning = true; break; }
                        }
                    }
                    catch {}
                }
            }

            // Launch Standalone Desktop Window (Edge or Chrome in App Mode - no browser URL bar)
            string edgePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Microsoft\Edge\Application\msedge.exe");
            if (!File.Exists(edgePath))
            {
                edgePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Microsoft\Edge\Application\msedge.exe");
            }

            string chromePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Google\Chrome\Application\chrome.exe");
            if (!File.Exists(chromePath))
            {
                chromePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Google\Chrome\Application\chrome.exe");
            }

            string browserExe = File.Exists(edgePath) ? edgePath : (File.Exists(chromePath) ? chromePath : null);

            if (browserExe != null)
            {
                var browserPsi = new ProcessStartInfo
                {
                    FileName = browserExe,
                    Arguments = "--app=http://localhost:3000 --window-size=1440,900 --user-data-dir=\"" + Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "MCContabil_App") + "\"",
                    UseShellExecute = true
                };
                Process.Start(browserPsi);
            }
            else
            {
                // Fallback to default browser
                Process.Start(new ProcessStartInfo { FileName = "http://localhost:3000", UseShellExecute = true });
            }
        }
    }
}