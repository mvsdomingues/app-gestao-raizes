' Inicia a aplicacao Raizes em segundo plano (sem janela do terminal).
' Para iniciar junto com o Windows: Win+R > shell:startup > crie um atalho para este arquivo.
Set fso = CreateObject("Scripting.FileSystemObject")
pasta = fso.GetParentFolderName(WScript.ScriptFullName)
CreateObject("WScript.Shell").Run """" & pasta & "\iniciar.cmd""", 0, False
