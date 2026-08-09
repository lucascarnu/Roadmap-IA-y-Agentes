# Lee los comentarios inline de una pull request de este repositorio.
#
# Unico parametro: el numero de la pull request, entero positivo.
# El repositorio esta fijo y no se acepta repo, URL, metodo ni flags externos.
# Ante cualquier entrada invalida falla sin invocar nada.

param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$Pr
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($args.Count -gt 0) {
    Write-Error 'Solo se acepta el numero de pull request. No se admiten argumentos adicionales.'
    exit 2
}

if ($Pr -notmatch '^[1-9][0-9]{0,5}$') {
    Write-Error "Numero de pull request invalido: '$Pr'. Debe ser un entero positivo."
    exit 2
}

$repo = 'lucascarnu/Roadmap-IA-y-Agentes'

gh api "repos/$repo/pulls/$Pr/comments" --paginate
exit $LASTEXITCODE
