$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$segments = Get-Content -Raw -LiteralPath 'scripts/demo-narration.json' | ConvertFrom-Json
$speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer
$speaker.SelectVoice('Microsoft David Desktop')
$speaker.Rate = 1
try {
    foreach ($segment in $segments) {
        $audioPath = [System.IO.Path]::GetFullPath(('tmp/demo/' + $segment.frame + '.wav'))
        $speaker.SetOutputToWaveFile($audioPath)
        $speaker.Speak($segment.text)
        $speaker.SetOutputToNull()
    }
} finally { $speaker.Dispose() }
Write-Output 'Local demo narration prepared.'
