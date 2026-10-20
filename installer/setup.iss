; 希 Xi · Inno Setup 安装包脚本
; 编译: "D:\Inno Setup 7\ISCC.exe" installer\setup.iss
; 输出: release\Xi_Setup_3.1.9.exe + release\unpack\(绿色版内容)

#define MyAppName "希 Xi"
#define MyAppNameCN "希"
#define MyAppVersion "3.2.0"
#define MyAppPublisher "firefly20041001"
#define MyAppExeName "xi.exe"
#define ReleaseDir "..\src-tauri\target\release"
#define RepoUrl "https://github.com/firefly20041001/Xi"

[Setup]
; AppId 固定:升级安装/卸载沿用同一应用身份
AppId={{D4E7A5B1-6C2F-4A89-9B3D-2E8F7C1A6B40}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
VersionInfoVersion={#MyAppVersion}
VersionInfoProductName={#MyAppName}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#RepoUrl}
AppSupportURL={#RepoUrl}
; 默认管理员模式(按 Program Files),但允许用户自选"仅为我安装"
PrivilegesRequiredOverridesAllowed=dialog
DefaultDirName={autopf}\Xi
DefaultGroupName=希
UninstallDisplayName={#MyAppName}
LicenseFile=..\LICENSE
SetupIconFile=..\src-tauri\icons\icon.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
WizardStyle=modern
Compression=lzma2/max
SolidCompression=yes
ArchitecturesInstallIn64BitMode=x64compatible
ArchitecturesAllowed=x64compatible
OutputDir=..\release
OutputBaseFilename=Xi_Setup_{#MyAppVersion}
; 通知已运行的播放器结束安装
CloseApplications=yes
ChangesEnvironment=no

[Languages]
Name: "chinesesimplified"; MessagesFile: "compiler:Languages\ChineseSimplified.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[CustomMessages]
CreateDesktopIcon=创建桌面快捷方式(&D)
LaunchXi=运行希 Xi
WebView2SetupNote=检测到系统缺少 WebView2 运行时,正在为您下载安装(需要联网)…
WebView2SetupFailed=WebView2 运行时自动安装失败。请手动安装后再运行:

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
; unchecked:不默认勾桌面图标,尊重用户桌面整洁(任务页可自行勾选)

[Files]
Source: "{#ReleaseDir}\xi.exe"; DestDir: "{app}"; Flags: ignoreversion
; 前端资源目录(app/):协议处理器盘上优先读取,缺失回退内嵌
Source: "..\dist\*"; DestDir: "{app}\app"; Flags: recursesubdirs ignoreversion
Source: "..\LICENSE"; DestDir: "{app}"; DestName: "LICENSE.txt"; Flags: ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\卸载 {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchXi}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
; 卸载程序目录本身(遗留配置在 %APPDATA%,不清理以免误删用户数据)
Type: filesandordirs; Name: "{app}"

[Code]
const
  WebView2Key = 'SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A20A2DB0}';

// WebView2 Runtime 是否已安装(既查机器级也查用户级)
function WebView2Installed(): Boolean;
begin
  Result := RegKeyExists(HKLM32, WebView2Key) or RegKeyExists(HKCU32, WebView2Key);
  if (not Result) and IsWin64() then
    Result := RegKeyExists(HKLM64, WebView2Key) or RegKeyExists(HKCU64, WebView2Key);
end;

// Win11(及更新)内置 WebView2;Win10 及以下才需要引导
// 通过 NT 当前构建号判断(22000 = Win11)
function IsWin11OrNewer(): Boolean;
var
  S: String;
begin
  Result := False;
  if RegQueryStringValue(HKLM, 'SOFTWARE\Microsoft\Windows NT\CurrentVersion',
    'CurrentBuildNumber', S) then
    Result := (StrToIntDef(S, 0) >= 22000);
end;

function InitializeSetup(): Boolean;
var
  Bootstrapper, Params: String;
  ResultCode: Integer;
begin
  Result := True;
  // Win11 内置 WebView2,无需引导
  if WebView2Installed() or IsWin11OrNewer() then Exit;
  try
    MsgBox(ExpandConstant('{cm:WebView2SetupNote}'), mbInformation, MB_OK);
    // WebView2 Evergreen Bootstrapper 官方分发链接(官方示例同样传 nil 免进度回调)
    DownloadTemporaryFile('https://go.microsoft.com/fwlink/?linkid=2099617',
      'MicrosoftEdgeWebview2Setup.exe', '', nil);
    Bootstrapper := ExpandConstant('{tmp}') + '\MicrosoftEdgeWebview2Setup.exe';
    if FileExists(Bootstrapper) then
    begin
      Params := '/silent /install';
      Exec(Bootstrapper, Params, ExpandConstant('{tmp}'), SW_SHOW, ewWaitUntilTerminated, ResultCode);
    end;
    if (not FileExists(Bootstrapper)) or (ResultCode <> 0) then
      MsgBox(ExpandConstant('{cm:WebView2SetupFailed}') + #13#10 +
        'https://developer.microsoft.com/microsoft-edge/webview2/',
        mbCriticalError, MB_OK);
  except
    MsgBox(ExpandConstant('{cm:WebView2SetupFailed}') + #13#10 +
      'https://developer.microsoft.com/microsoft-edge/webview2/',
      mbCriticalError, MB_OK);
  end;
end;
