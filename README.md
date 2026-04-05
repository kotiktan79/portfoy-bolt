# 📊 Portföy Takip - Profesyonel Yatırım Yönetimi

Gerçek zamanlı fiyat takibi ile yatırımlarınızı profesyonel şekilde yönetin. Hisse, kripto, döviz, emtia ve daha fazlası.

## ✨ Özellikler

### 🎯 Temel Özellikler
- **Canlı Fiyat Takibi**: Her 3 saniyede otomatik güncelleme
- **WebSocket Desteği**: Kripto paralar için gerçek zamanlı fiyatlar
- **Çoklu Varlık Desteği**: Hisse, kripto, döviz, fon, eurobond, emtia
- **Kar/Zarar Analizi**: Anlık ve geçmiş performans takibi
- **Grafik ve Görseller**: Gelişmiş teknik analiz araçları

### 📈 Analiz ve Raporlama
- **Portföy Performansı**: Zaman bazlı grafik analizi
- **Varlık Dağılımı**: Pasta ve bar grafiklerle görselleştirme
- **Benchmark Karşılaştırma**: BIST, S&P 500, Altın, BTC ile karşılaştırma
- **Risk Metrikleri**: Volatilite, Sharpe Ratio, Max Drawdown
- **Teknik Göstergeler**: RSI, MACD, Bollinger Bands

### 🤖 Akıllı Özellikler
- **AI Portfolio Önerileri**: Yapay zeka destekli yatırım önerileri
- **Trading Sinyalleri**: Al/Sat sinyalleri
- **Fiyat Alarmları**: Özelleştirilebilir bildirimler
- **Otomatik Rebalance**: Portföy dengeleme önerileri

### 💼 İşlem Yönetimi
- **Alım/Satım İşlemleri**: Detaylı işlem kaydı
- **İşlem Geçmişi**: Tüm işlemlerinizi görüntüleyin
- **Temettü Takibi**: Temettü gelirleri kayıt altında
- **Aylık Çekim Hesaplama**: Düzenli gelir planlaması

### 🎨 Kullanıcı Deneyimi
- **Karanlık Mod**: Göz dostu arayüz
- **Responsive Tasarım**: Mobil, tablet, masaüstü uyumlu
- **PWA Desteği**: Mobil uygulama gibi kullanım
- **Çoklu Dil**: Türkçe ve İngilizce

### 🔐 Güvenlik
- **Supabase Auth**: Güvenli kimlik doğrulama
- **Row Level Security**: Veri güvenliği
- **2FA Desteği**: İki faktörlü doğrulama
- **Yedekleme/Geri Yükleme**: Verilerinizi koruyun

## 🚀 Kurulum

### Gereksinimler
- Node.js 18+
- npm veya yarn
- Supabase hesabı

### Adımlar

1. **Projeyi Klonlayın**
```bash
git clone <repository-url>
cd portfolio-tracker
```

2. **Bağımlılıkları Yükleyin**
```bash
npm install
```

3. **Ortam Değişkenlerini Ayarlayın**
`.env` dosyasını oluşturun:
```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

4. **Veritabanı Migrasyonlarını Çalıştırın**
Supabase migrations klasöründeki dosyalar otomatik uygulanır.

5. **Geliştirme Sunucusunu Başlatın**
```bash
npm run dev
```

6. **Production Build**
```bash
npm run build
npm run preview
```

## 📱 Kullanım

### Ana Sayfa
- Tüm varlıklarınızı görüntüleyin
- Kar/zarar durumunuzu takip edin
- Grafikleri ve analizleri inceleyin

### Canlı Dashboard
`/dashboard.html` sayfasında:
- Tam ekran mod
- Canlı fiyat güncellemeleri
- En iyi/en kötü performans gösteren varlıklar

### Varlık Ekleme
1. "Yeni Varlık Ekle" butonuna tıklayın
2. Sembol, tip, fiyat ve miktarı girin
3. Otomatik fiyat takibi başlar

### Alım/Satım İşlemleri
1. Varlık satırındaki "Al/Sat" butonlarını kullanın
2. İşlem detaylarını girin
3. Kar/zarar otomatik hesaplanır

## 🔧 Teknolojiler

### Frontend
- **React 18**: Modern UI framework
- **TypeScript**: Tip güvenliği
- **Tailwind CSS**: Utility-first CSS
- **Recharts**: Grafik kütüphanesi
- **Lucide React**: İkon kütüphanesi

### Backend
- **Supabase**: Database, Auth, Edge Functions
- **PostgreSQL**: İlişkisel veritabanı
- **Row Level Security**: Veri güvenliği

### API'ler
- **Yahoo Finance**: Hisse fiyatları
- **Binance WebSocket**: Kripto fiyatları
- **Frankfurter API**: Döviz kurları
- **Foreks API**: Altın fiyatları

## 📊 Veritabanı Şeması

### Tablolar
- `holdings`: Varlıklar
- `transactions`: İşlemler
- `portfolio_snapshots`: Portföy anlık görüntüleri
- `price_history`: Fiyat geçmişi
- `price_alerts`: Fiyat alarmları
- `dividends`: Temettü kayıtları
- `achievements`: Başarımlar
- `automation_rules`: Otomasyon kuralları

## 🎯 Özellik Durumu

| Özellik | Durum |
|---------|-------|
| Canlı Fiyat Takibi | ✅ |
| Çoklu Varlık Desteği | ✅ |
| Grafik ve Analiz | ✅ |
| İşlem Yönetimi | ✅ |
| Fiyat Alarmları | ✅ |
| Dark Mode | ✅ |
| Responsive Design | ✅ |
| PWA | ✅ |
| Error Boundary | ✅ |
| Cache Management | ✅ |
| Performance Optimization | ✅ |

## 🚧 Geliştirme Notları

### Edge Functions
- `bist-live-prices`: BIST hisse fiyatları
- `email-alerts`: E-posta bildirimleri

### Önbellekleme
- Fiyatlar 3 saniye cache'lenir
- USD kuru 5 dakika cache'lenir
- Portfolio snapshots günlük

### Performans
- React.memo kullanımı
- Lazy loading
- Code splitting
- Image optimization

## 📝 Lisans

MIT License - Detaylar için LICENSE dosyasına bakın.

## 🤝 Katkıda Bulunma

1. Fork edin
2. Feature branch oluşturun (`git checkout -b feature/amazing-feature`)
3. Commit yapın (`git commit -m 'Add amazing feature'`)
4. Push edin (`git push origin feature/amazing-feature`)
5. Pull Request açın

## 📧 İletişim

Sorularınız için issue açabilirsiniz.

## 🙏 Teşekkürler

- Yahoo Finance API
- Binance API
- Frankfurter API
- Foreks API
- Supabase
- Tüm açık kaynak katkıda bulunanlar

---

**⚠️ Uyarı**: Bu uygulama yatırım tavsiyesi vermez. Tüm yatırım kararları kişiseldir.
