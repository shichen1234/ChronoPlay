; Inno Setup Script for ChronoPlay
; 官方免费安装包生成工具脚本

[Setup]
AppName=ChronoPlay
AppVersion=1.0.0
AppPublisher=ChronoPlay Team
DefaultDirName={autopf}\ChronoPlay
DefaultGroupName=ChronoPlay
OutputDir=release
OutputBaseFilename=ChronoPlay_Setup_v1.0
SetupIconFile=public\tubiao.ico
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "desktop-app\ChronoPlay-win32-x64\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\ChronoPlay"; Filename: "{app}\ChronoPlay.exe"
Name: "{group}\{cm:UninstallProgram,ChronoPlay}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\ChronoPlay"; Filename: "{app}\ChronoPlay.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\ChronoPlay.exe"; Description: "{cm:LaunchProgram,ChronoPlay}"; Flags: nowait postinstall skipifsilent
