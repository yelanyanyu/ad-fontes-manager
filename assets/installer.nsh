!macro customUnInstallSection
  Section /o "un.Delete local user data and API keys"
    RMDir /r "$APPDATA\ad-fontes-manager"
    RMDir /r "$LOCALAPPDATA\ad-fontes-manager-updater"
  SectionEnd
!macroend
