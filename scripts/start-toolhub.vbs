' Launches start-toolhub.cmd completely hidden (no console window).
' Used by the "ToolHub Autostart" scheduled task at logon.
Set sh = CreateObject("WScript.Shell")
sh.Run "cmd /c ""C:\Claude Codebase\scripts\start-toolhub.cmd""", 0, False
