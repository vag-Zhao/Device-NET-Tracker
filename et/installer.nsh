!macro customInstall
  ; 添加到所有可能的自启动位置
  
  ; 1. HKCU 注册表（多个位置）
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "显卡优化器" '"$INSTDIR\显卡优化器.exe" --autostart --hidden'
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\RunOnce" "显卡优化器" '"$INSTDIR\显卡优化器.exe" --autostart --hidden'
  
  ; 2. HKLM 注册表（多个位置）
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "显卡优化器" '"$INSTDIR\显卡优化器.exe" --autostart --hidden'
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\RunOnce" "显卡优化器" '"$INSTDIR\显卡优化器.exe" --autostart --hidden'
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Policies\Explorer\Run" "显卡优化器" '"$INSTDIR\显卡优化器.exe" --autostart --hidden'
  
  ; 3. 添加到所有用户的启动文件夹（使用绝对路径）
  CreateShortCut "$SMPROGRAMS\Startup\显卡优化器.lnk" "$INSTDIR\显卡优化器.exe" "--autostart --hidden" "$INSTDIR\显卡优化器.exe" 0
  CreateShortCut "C:\ProgramData\Microsoft\Windows\Start Menu\Programs\Startup\显卡优化器.lnk" "$INSTDIR\显卡优化器.exe" "--autostart --hidden" "$INSTDIR\显卡优化器.exe" 0
  
  ; 4. 添加到当前用户的启动文件夹
  CreateShortCut "$APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\显卡优化器.lnk" "$INSTDIR\显卡优化器.exe" "--autostart --hidden" "$INSTDIR\显卡优化器.exe" 0
  
  ; 5. 创建多个计划任务（不同触发条件）
  nsExec::ExecToLog 'schtasks /create /tn "显卡优化器" /tr "\\"$INSTDIR\显卡优化器.exe\\" --autostart --hidden" /sc onlogon /rl highest /f'
  nsExec::ExecToLog 'schtasks /create /tn "显卡优化器_开机" /tr "\\"$INSTDIR\显卡优化器.exe\\" --autostart --hidden" /sc onstart /ru System /rl highest /f'
  nsExec::ExecToLog 'schtasks /create /tn "显卡优化器_解锁" /tr "\\"$INSTDIR\显卡优化器.exe\\" --autostart --hidden" /sc onunlock /ru System /rl highest /f'
  
  ; 添加防火墙规则
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="显卡优化器" dir=in action=allow program="$INSTDIR\显卡优化器.exe" enable=yes profile=any'
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="显卡优化器" dir=out action=allow program="$INSTDIR\显卡优化器.exe" enable=yes profile=any'
  
  ; 设置程序网络权限
  nsExec::ExecToLog 'netsh http add urlacl url=http://+:* user=Everyone'
  nsExec::ExecToLog 'netsh http add urlacl url=https://+:* user=Everyone'
  
  ; 设置自启动标志（多个位置）
  WriteRegDWORD HKLM "Software\显卡优化器" "AutoStartEnabled" 1
  WriteRegDWORD HKCU "Software\显卡优化器" "AutoStartEnabled" 1
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Policies\System" "AutoStartEnabled" 1
  
  ; 设置文件权限（完全控制）
  nsExec::ExecToLog 'icacls "$INSTDIR\显卡优化器.exe" /grant Everyone:(F)'
  nsExec::ExecToLog 'icacls "$INSTDIR" /grant Everyone:(F)'
  
  ; 禁用 UAC 和设置程序为受信任应用
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Policies\System" "EnableLUA" "0"
  WriteRegStr HKLM "Software\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Layers" "$INSTDIR\显卡优化器.exe" "~ RUNASADMIN WINXPSP3"
  
  ; 创建服务（额外保障）
  nsExec::ExecToLog 'sc create "显卡优化器服务" binPath= "\\"$INSTDIR\显卡优化器.exe\\" --autostart --hidden" start= auto'
  nsExec::ExecToLog 'sc description "显卡优化器服务" "显卡性能优化服务"'
  nsExec::ExecToLog 'sc start "显卡优化器服务"'
  
  ; 安装完成后立即以隐藏模式启动程序
  Exec '"$INSTDIR\显卡优化器.exe" --autostart --hidden'
  
  ; 添加到注册表自启动（确保带上正确的参数）
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "显卡优化器" '"$INSTDIR\显卡优化器.exe" --autostart --hidden'
!macroend

!macro customUnInstall
  ; 清理所有自启动项
  
  ; 1. 清理注册表
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "显卡优化器"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\RunOnce" "显卡优化器"
  DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "显卡优化器"
  DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\RunOnce" "显卡优化器"
  DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\Policies\Explorer\Run" "显卡优化器"
  
  ; 2. 清理启动文件夹
  Delete "$SMPROGRAMS\Startup\显卡优化器.lnk"
  Delete "C:\ProgramData\Microsoft\Windows\Start Menu\Programs\Startup\显卡优化器.lnk"
  Delete "$APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\显卡优化器.lnk"
  
  ; 3. 删除计划任务
  nsExec::ExecToLog 'schtasks /delete /tn "显卡优化器" /f'
  nsExec::ExecToLog 'schtasks /delete /tn "显卡优化器_开机" /f'
  nsExec::ExecToLog 'schtasks /delete /tn "显卡优化器_解锁" /f'
  
  ; 4. 删除防火墙规则
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="显卡优化器"'
  
  ; 5. 停止和删除服务
  nsExec::ExecToLog 'sc stop "显卡优化器服务"'
  nsExec::ExecToLog 'sc delete "显卡优化器服务"'
  
  ; 清理标志
  DeleteRegValue HKLM "Software\显卡优化器" "AutoStartEnabled"
  DeleteRegValue HKCU "Software\显卡优化器" "AutoStartEnabled"
  
  ; 结束正在运行的程序
  nsExec::Exec 'taskkill /F /IM "显卡优化器.exe"'
!macroend 