# MLScript Studio

<div align="center">
  <video src="docs/usage.mp4" width="100%" controls autoplay loop muted>
    Twoja przeglądarka nie obsługuje odtwarzacza wideo. Plik demonstracyjny znajduje się w lokalizacji <code>docs/usage.mp4</code>.
  </video>
</div>

![](docs/usage.mp4)


## O projekcie

MLScript Studio to dedykowane, desktopowe środowisko programistyczne (IDE) stworzone dla języka MLScript. Aplikacja łączy wysoką wydajność backendu napisanego w języku Rust (przy użyciu frameworka Tauri) z nowoczesnym i responsywnym interfejsem graficznym zbudowanym w React i TypeScript.

## Główne funkcje

* **Zaawansowany edytor kodu:** Zintegrowany edytor oparty na Monaco Editor, zapewniający profesjonalne wrażenia z pisania kodu.
* **Wielookienkowość:** Architektura oparta na React Router pozwala na niezależne zarządzanie głównym oknem środowiska (`/`) oraz wyskakującym oknem analizy danych (`/dataset`).
* **Przeglądarka zbiorów danych:** Dedykowany widok wspierany przez bibliotekę PapaParse, pozwalający na błyskawiczne i bezproblemowe parsowanie oraz analizę plików.
* **Optymalizacja pod systemy Linux:** Wbudowana obsługa specyficznych zmiennych środowiskowych wymuszających renderowanie X11 oraz wyłączających problematyczne funkcje WebKit.

## Wymagania wstępne

Aby uruchomić projekt lokalnie, upewnij się, że w Twoim systemie zainstalowane są:
* **Node.js** (zalecana najnowsza wersja LTS) oraz menedżer pakietów `npm`
* **Rust** oraz narzędzie `cargo`
* **Zależności systemowe Tauri** (szczególnie biblioteki `libwebkit2gtk-4.1-dev` oraz narzędzia kompilacji na systemach Linux)

## Instalacja

1. Sklonuj repozytorium i przejdź do folderu projektu:
   ```bash
   git clone <adres-repozytorium>
   cd mlscript-studio

    Zainstaluj wymagane zależności frontendu:
    Bash

    npm install
   ```

## Uruchamianie

Aby uruchomić środowisko IDE, wpisz w terminalu:
```bash
npm run tauri dev
```

  Uwaga techniczna: Projekt wykorzystuje specjalnie dostosowany skrypt uruchomieniowy (GDK_BACKEND=x11 WEBKIT_DISABLE_DMABUF_RENDERER=1 WEBKIT_DISABLE_COMPOSITING_MODE=1 tauri), który zapobiega     błędom renderowania interfejsu (takim jak brak widoczności zawartości okna) na wybranych dystrybucjach Linuxa.

## Budowanie wersji produkcyjnej

Aby skompilować aplikację do ostatecznego pliku wykonywalnego:

```bash
npm run build
```
Proces ten najpierw zweryfikuje typy TypeScript, zbuduje pliki statyczne za pomocą Vite, a następnie skompiluje warstwę Rust, generując gotową do dystrybucji paczkę.
