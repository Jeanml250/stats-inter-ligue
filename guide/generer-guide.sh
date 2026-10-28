#!/bin/zsh
# Régénère les captures du rapport et le guide PDF à partir de guide.html.
# Usage : zsh guide/generer-guide.sh   (après node extraire.mjs)
set -e
ICI=${0:A:h}
RAPPORT="$ICI/../resultats/rapport.html"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# Captures en mode clair, quel que soit le réglage du Mac.
CLAIR='<style>:root{--fond:#f6f5f2!important;--carte:#fff!important;--texte:#1d1d1f!important;--doux:#6b6b70!important;--ligne:#e3e1dc!important;--accent:#1f5fae!important;--accent-fond:#e8f0fa!important;--plus:#1d7a3e!important;--moins:#b3261e!important;--zebre:#fafaf8!important}html{color-scheme:light}</style>'

capture() { # nom, taille, script d'état
  cp "$RAPPORT" "$TMP/$1.html"
  printf '%s<script>%s</script>' "$CLAIR" "$3" >> "$TMP/$1.html"
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=2 \
    --window-size=$2 --screenshot="$ICI/$1.png" "file://$TMP/$1.html" 2>/dev/null
}

capture tournois  1560,720  "etat.vue='tournois';etat.tournoi='interligueavril2026';etat.parEquipe=false;etat.filtre='';rendre();"
capture equipe    1500,640  "etat.vue='tournois';etat.tournoi='interligueavril2026';etat.parEquipe=true;etat.filtre='';rendre();"
capture joueur    1560,600  "etat.vue='joueur';etat.joueur='julie fortin';rendre();"
capture recherche 1000,390  "etat.vue='joueur';etat.joueur=null;rendre();const c=document.querySelector('#cherche');c.value='pell';c.dispatchEvent(new Event('input'));"
capture rapproche 1560,470  "etat.vue='tournois';etat.tournoi='interliguemars2026';etat.parEquipe=false;etat.filtre='trudel';rendre();"

"$CHROME" --headless=new --disable-gpu --no-pdf-header-footer \
  --print-to-pdf="$ICI/../Guide-utilisateur-Stats-Inter-Ligue.pdf" "file://$ICI/guide.html" 2>/dev/null
echo "Guide : $ICI/../Guide-utilisateur-Stats-Inter-Ligue.pdf"
