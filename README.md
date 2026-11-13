# DJAI — Autonomous AI DJ

![DJAI Dark Techno](https://img.shields.io/badge/TECHNO-ACID%20%7C%20HARD%20%7C%20INDUSTRIAL-00ff66?style=for-the-badge)
![Electron](https://img.shields.io/badge/Electron-45.x-blue?style=for-the-badge)
![React](https://img.shields.io/badge/React-19.x-61dafb?style=for-the-badge)
![Web Audio API](https://img.shields.io/badge/Web%20Audio%20API-DSP%20Engine-orange?style=for-the-badge)
![Gemini AI](https://img.shields.io/badge/Google%20Gemini-AI%20Brain-purple?style=for-the-badge)

**DJAI**, harici bir DJ yazılımına (Rekordbox, VirtualDJ, Traktor) veya fiziksel DJ kontrolcüsüne ihtiyaç duymadan, doğrudan kendi profesyonel ses motoru (DSP / Web Audio API) ve **Google Gemini AI** karar mekanizmasıyla çalışan otonom bir AI DJ masaüstü uygulamasıdır.

Müzik türü odağı: **Acid Techno, Hard Techno, Underground Rave, Industrial Techno**.

---

## ⚡ Özellikler & Mimari

### 1. DJ Audio Engine (Web Audio API)
- **Çift Bağımsız Deck (Deck A & Deck B):** İki parça aynı anda mikslenebilir, bağımsız pitch/tempo ve EQ kontrollerine sahiptir.
- **Master Clipping Koruması & Limiter:** Çıkışta ses patlamalarını önlemek için `DynamicsCompressorNode` (-1dB threshold, 20:1 ratio, 3ms attack) kullanılır.
- **Hassas Zamanlama:** Tüm geçişler ve efektler, JS `setTimeout` gecikmelerinden bağımsız olarak `AudioContext.currentTime` ve Web Audio otomasyon eğrileri (`linearRampToValueAtTime`) ile sample-accurate yürütülür.
- **3-Band Isolator EQ:** Low Shelf (120Hz), Mid Peaking (1000Hz), High Shelf (8000Hz) ile -24dB cut'tan +6dB boost'a kadar isolator kontrolleri ve KILL butonları.
- **DJ Bipolar Filter:** Tek düğmeyle sola çevrildiğinde LPF (200Hz sweep), sağa çevrildiğinde HPF (2500Hz sweep) rezonanslı asit filtresi.
- **Equal Power Crossfader:** Enerji kaybını önleyen dairesel sabit güç eğrisi ($cos / sin$).

### 2. Music Analysis Engine (Gerçek DSP)
- **BPM & Beatgrid Tespiti:** 50Hz-150Hz sub-bass / kick frekansları izole edilerek zarf tespiti ve otokorelasyon (autocorrelation) ile gerçek ses sinyalinden BPM çıkarımı.
- **İlk Vuruş (Downbeat) Tespiti:** Parçanın ilk kick vuruşu saniye cinsinden hesaplanarak vuruş ızgarası hizalanır.
- **RMS Enerji & Peak Profili:** 500ms aralıklarla enerji haritası çıkarılır ve dalga formunda görselleştirilir.
- **Breakdown & Drop Tespiti:** Sinyalde gerçek bir düşüş ve ardından ani enerji sıçraması yoksa uydurma değer üretilmez; tespit edilirse işaretlenir.
- **Manuel Düzeltme:** Kullanıcı dilerse arayüzdeki "EDIT" butonu ile BPM, downbeat offset ve cue noktalarını elle güncelleyebilir.

### 3. Otomatik Geçişler (Auto DJ Transitions)
- **Bass Swap (Techno İmzası):** Deck B bass'ı tamamen kısık (-24dB) başlar. Ölçü geçiş anında Deck A bass'ı anında kesilirken Deck B'nin bass'ı patlatılır.
- **16-Bar & 32-Bar Extended Mixes:** Techno'ya özgü 64 ve 128 vuruşluk hipnotik uzun miksler.
- **Filter Sweep Transition:** Giden parçanın yüksek frekans filtresi süpürülürken gelen parça pürüzsüz girer.
- **Smooth Crossfade:** Klasik yumuşak crossfade.

### 4. Gemini AI DJ Brain & Çevrimdışı Kural Motoru
- **Google Gemini Entegrasyonu:** Parça dosyaları internete gönderilmez; yalnızca BPM, enerji, süre ve tür metadataları gönderilerek JSON formatında sıradaki parça, geçiş türü ve ölçü sayısı kararı alınır.
- **%100 Kesintisiz Çevrimdışı Çalışma (Offline Rule Engine):** Gemini API anahtarı girilmemişse, internet koparsa veya kota aşılırsa sistem anında yerel kural tabanlı algoritmaya geçer ve **müzik asla durmaz**.

### 5. DJ Kişilikleri (Personalities) & Canlı Komutlar
- **UNDERGROUND:** Dark Acid Techno, hipnotik 32-bar geçişler, derin ve dengeli enerji.
- **RAVE MADNESS:** Hard Techno, yüksek tempo, agresif Bass Swap geçişleri.
- **ACID EXPERIENCE:** 303 acid hatları, rezonanslı filtre geçişleri.
- **PEAK TIME:** Festival/kulüp zirve anları, drop odaklı enerji.
- **Canlı Komutlar (Crowd Triggers):**
  - `GO HARDER`: Enerji hedefini anında yükseltir ve sert Bass Swap hazırlar.
  - `KEEP THE GROOVE`: Mevcut BPM ve tempoyu koruyarak hipnotik miks sürdürür.
  - `BUILD TENSION`: Filtreleri yükselterek tansiyon oluşturur.

### 6. Party Mode & Güvenlik
- **macOS & Windows Uyku Engelleme:** Electron `powerSaveBlocker` seti boyunca ekranın veya işletim sisteminin uykuya geçmesini engeller.
- **Dahili Techno Demo Paketi:** Bilgisayarında hazır MP3 bulunmayan kullanıcılar için tek tıkla 4 parçalık saf procedural Acid/Hard Techno parçaları üretilerek anında çalınabilir.

---

## 🚀 Kurulum ve Çalıştırma (Windows)

### Gereksinimler
- Node.js v18+ (Node.js 20 veya 24 önerilir)
- npm veya yarn

### Adımlar

1. Bağımlılıkları yükleyin:
   ```bash
   npm install
   ```

2. Geliştirici (Development) modunda başlatın:
   ```bash
   npm run dev
   ```

3. Üretim (Production) derlemesi:
   ```bash
   npm run build
   npm start
   ```

4. Windows için paketleme (Installer & Portable EXE):
   ```bash
   npm run package:win
   ```
   Çıktı `release/` klasöründe oluşur.

---

## 🍏 macOS Kurulum ve Paketleme Rehberi

DJAI, hem **Apple Silicon (M1, M2, M3, M4 - arm64)** hem de **Intel (x64)** mimarili Mac bilgisayarları tam olarak destekleyecek şekilde platform-bağımsız tasarlanmıştır.

### macOS Üzerinde Geliştirme & Çalıştırma

1. Terminal'i açın ve projeyi klonlayın/açın:
   ```bash
   cd /path/to/DJAI
   ```

2. Bağımlılıkları kurun:
   ```bash
   npm install
   ```

3. macOS üzerinde doğrudan başlatın:
   ```bash
   npm run dev
   ```

### macOS İçin DMG / Zip Paketleme

macOS paketlerini oluşturmak için:

1. Hem Intel hem Apple Silicon (Universal) DMG oluşturmak için:
   ```bash
   npm run package:mac
   ```

2. Derleme sonrasında `release/` dizininde:
   - `DJAI-1.0.0-arm64.dmg` (Apple Silicon Mac'ler için)
   - `DJAI-1.0.0-x64.dmg` (Intel Mac'ler için)
   - `DJAI-1.0.0-universal.dmg` (Tüm Mac'ler için Universal Binary)
   dosyaları hazır hale gelecektir.

3. Mac'e kurmak için `.dmg` dosyasını açıp DJAI ikonunu `Applications` (Uygulamalar) klasörüne sürüklemeniz yeterlidir.

---

---

## 📦 Hazır Kurulum Dosyaları (GitHub Actions)

`main` dalına her push'ta GitHub Actions, macOS (`.dmg` / `.zip`, Apple Silicon + Intel + Universal) ve Windows (`.exe`) kurulum dosyalarını otomatik derler.
İndirmek için: GitHub'da **Actions** sekmesi → son "Build installers" çalışması → sayfanın altındaki **Artifacts** bölümü.

Uygulama imzasız olduğu için macOS ilk açılışta uyarı verir: uygulamaya sağ tıklayıp **Aç** deyin. "Hasar görmüş" uyarısı çıkarsa:
```bash
xattr -cr /Applications/DJAI.app
```

---

## 🧪 Doğrulama ve Test Kriterleri Uyumluluğu

Uygulama şartnamedeki 10 test kriterini eksiksiz karşılar:

| No | Kriter | Durum | Açıklama |
|---|---|---|---|
| 1 | Kullanıcı iki MP3/WAV dosyası yükleyebiliyor | ✅ | IPC `dialog:openFiles` ve `audio:readFile` ile limitsiz yükleme |
| 2 | Her iki deck bağımsız çalışıyor | ✅ | Deck A & Deck B bağımsız buffer, playbackRate, gain, EQ zincirine sahip |
| 3 | İki deck arasında gerçek ses geçişi gerçekleşiyor | ✅ | Equal power crossfader ve otomatik otomasyon geçişleri |
| 4 | Otomatik mod sonraki parçayı seçiyor | ✅ | Gemini AI veya dahili LocalBrain sıradaki parçayı seçer |
| 5 | Otomatik mod en az 3 ardışık parçayı geçişlerle çalabiliyor | ✅ | Otomatik state machine parçalar bittikçe zincirleme miksler |
| 6 | Gemini API anahtarı olmadan uygulama çalışıyor | ✅ | API key yokken `LocalBrain` devreye girer |
| 7 | API bağlantısı kesildiğinde müzik durmuyor | ✅ | Hata yakalanır, yerel algoritmaya dönülür, ses kesintiye uğramaz |
| 8 | Ses çıkışı seçili hoparlörden geliyor | ✅ | Web Audio `AudioContext.destination` üzerinden sisteme verilir |
| 9 | Windows development sürümü çalışıyor | ✅ | Windows 11 üzerinde test edildi ve doğrulandı |
| 10 | macOS kurulum süreci belgelenmiş | ✅ | Apple Silicon & Intel DMG kurulum adımları dokümante edildi |

---

## 🎹 Hızlı Başlangıç

1. Uygulamayı başlatın.
2. İlk açılışta veya dilediğiniz an kütüphane araç çubuğundaki **"Instant Techno Pack (Demo)"** butonuna tıklayarak dahili 303 Acid ve Hard Techno parçalarını yükleyin.
3. Veya bilgisayarınızdaki techno parçalarını eklemek için **"Add Audio Files"** veya **"Add Folder"** butonunu kullanın.
4. Parçaların yanında bulunan **"LOAD A"** ve **"LOAD B"** butonlarıyla deck'lere yükleyin.
5. Deck A üzerindeki büyük yeşil **"PLAY"** butonuna basın.
6. Ortadaki **"AUTO DJ"** düğmesini aktif hale getirin veya **"TRIGGER MIX NOW"** butonuna basarak anında Bass Swap geçişini dinleyin!
7. Ayarlar simgesine (dişli çark) tıklayarak dilerseniz Google Gemini API anahtarınızı girin.

