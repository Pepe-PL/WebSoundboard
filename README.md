# WebSoundboard

Mobilny soundboard hostowany jako statyczna strona GitHub Pages.

## Uruchomienie

1. W repozytorium otwórz **Settings → Pages**.
2. Ustaw źródło na branch `main` i katalog `/(root)`.
3. Po wdrożeniu otwórz `https://pepe-pl.github.io/WebSoundboard/`.

## Dodawanie dźwięków

Wrzuć obsługiwany plik audio do `sounds/` i zrób push do `main`. Workflow **Generate sounds manifest** zaktualizuje `sounds.json`; można go też uruchomić ręcznie w zakładce **Actions**. Przycisk **Odśwież** pobiera aktualną listę bezpośrednio z GitHub API, a gdy API jest niedostępne, ponownie wczytuje manifest.

Obsługiwane formaty: MP3, WAV, OGG, M4A, AAC i OGA. Nazwa pliku staje się etykietą przycisku.

## Telefon i tryb offline

W przeglądarce telefonu wybierz **Dodaj do ekranu głównego**. Service worker zapisuje pliki aplikacji i odwiedzone dźwięki w pamięci podręcznej, więc wcześniej wczytane klipy mogą działać także offline. iOS może wymagać dodania skrótu z menu Udostępnij w Safari.