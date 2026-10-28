/**
 * Tek anahtar. Claude / Anthropic kullanımı.
 *
 * Varsayılan KAPALI — sahip API ücreti ödemesin.
 * Yeniden açmak için yalnız bu sabiti `true` yapın (Vercel'de ANTHROPIC_API_KEY de gerekir).
 * Tür `boolean` tutulur ki kapalı dal derlemede silinmesin; açmak tek satırdır.
 */
export const AI_ENABLED: boolean = false;

export const AI_DISABLED_MESSAGE = 'Yapay zekâ özelliği kapalı';

/**
 * daily_reports.ai_model null ise satır, risk-monitor'ün kısmi kaydı sanılır
 * (haftalık plan ve rapor listesi onu atlar). Kapalıyken Claude modeli yazılmaz.
 */
export const AI_OFF_MODEL = 'disabled';
