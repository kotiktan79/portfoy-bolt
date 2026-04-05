import { useEffect, useState } from 'react';
import { Bell, MessageSquare, Send, Check, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useToast } from '../hooks/useToast';

interface NotificationConfig {
  id: string;
  notification_type: 'telegram' | 'discord' | 'email';
  config: {
    botToken?: string;
    chatId?: string;
    webhookUrl?: string;
    email?: string;
  };
  enabled: boolean;
  events: string[];
  created_at: string;
}

const AVAILABLE_EVENTS = [
  { id: 'price_alert', label: 'Fiyat Uyarıları', icon: '💰' },
  { id: 'stop_loss', label: 'Stop Loss Tetiklenmeleri', icon: '🛑' },
  { id: 'take_profit', label: 'Take Profit Tetiklenmeleri', icon: '🎯' },
  { id: 'rebalance', label: 'Rebalance İşlemleri', icon: '⚖️' },
  { id: 'daily_summary', label: 'Günlük Özet', icon: '📊' },
  { id: 'transaction', label: 'İşlem Bildirimleri', icon: '💸' },
];

export function NotificationSettings() {
  const toast = useToast();
  const [configs, setConfigs] = useState<NotificationConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);

  useEffect(() => {
    loadConfigs();
  }, []);

  async function loadConfigs() {
    setLoading(true);
    const { data, error } = await supabase
      .from('notification_settings')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setConfigs(data);
    }
    setLoading(false);
  }

  async function toggleEnabled(id: string, currentState: boolean) {
    const { error } = await supabase
      .from('notification_settings')
      .update({ enabled: !currentState })
      .eq('id', id);

    if (!error) {
      setConfigs(configs.map(c => c.id === id ? { ...c, enabled: !currentState } : c));
    }
  }

  async function deleteConfig(id: string) {
    const { error } = await supabase
      .from('notification_settings')
      .delete()
      .eq('id', id);

    if (!error) {
      setConfigs(configs.filter(c => c.id !== id));
    }
  }

  async function testNotification(config: NotificationConfig) {
    setTestingId(config.id);

    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-notification`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: config.notification_type,
          message: '🧪 Test Bildirimi\n\nBu bir test mesajıdır. Bildirim sisteminiz çalışıyor!',
          config: config.config,
        }),
      });

      const result = await response.json();

      if (result.success) {
        toast.success('Test bildirimi başarıyla gönderildi!');
      } else {
        toast.error('Hata: ' + result.error);
      }
    } catch (error) {
      toast.error('Bildirim gönderilemedi: ' + (error instanceof Error ? error.message : 'Bilinmeyen hata'));
    } finally {
      setTestingId(null);
    }
  }

  const getIcon = (type: string) => {
    switch (type) {
      case 'telegram': return <Send className="text-blue-500" size={20} />;
      case 'discord': return <MessageSquare className="text-indigo-500" size={20} />;
      default: return <Bell className="text-gray-500" size={20} />;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'telegram': return 'Telegram';
      case 'discord': return 'Discord';
      default: return type;
    }
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-gray-700">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-slate-200 dark:bg-gray-700 rounded w-1/3"></div>
          <div className="space-y-3">
            {[1, 2].map(i => (
              <div key={i} className="h-24 bg-slate-200 dark:bg-gray-700 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Bell className="text-blue-600" size={24} />
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">
              Bildirim Ayarları
            </h3>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Bildirim Ekle
          </button>
        </div>

        {configs.length === 0 ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            <Bell size={48} className="mx-auto mb-4 opacity-50" />
            <p>Henüz bildirim ayarı eklenmemiş</p>
            <p className="text-sm mt-2">Telegram veya Discord bildirimleri ekleyin</p>
          </div>
        ) : (
          <div className="space-y-4">
            {configs.map((config) => (
              <div
                key={config.id}
                className={`border rounded-lg p-4 ${
                  config.enabled
                    ? 'border-gray-200 dark:border-gray-700'
                    : 'border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 opacity-60'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 flex-1">
                    {getIcon(config.notification_type)}
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-semibold text-gray-900 dark:text-white">
                          {getTypeLabel(config.notification_type)}
                        </span>
                        {config.enabled ? (
                          <span className="text-xs px-2 py-0.5 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded">
                            Aktif
                          </span>
                        ) : (
                          <span className="text-xs px-2 py-0.5 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded">
                            Pasif
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2 mb-3">
                        {config.events.map((event) => {
                          const eventInfo = AVAILABLE_EVENTS.find(e => e.id === event);
                          return eventInfo ? (
                            <span
                              key={event}
                              className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded"
                            >
                              {eventInfo.icon} {eventInfo.label}
                            </span>
                          ) : null;
                        })}
                      </div>

                      {config.notification_type === 'telegram' && config.config.chatId && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Chat ID: {config.config.chatId}
                        </p>
                      )}
                      {config.notification_type === 'discord' && config.config.webhookUrl && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Webhook: {config.config.webhookUrl.substring(0, 50)}...
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => testNotification(config)}
                      disabled={testingId === config.id || !config.enabled}
                      className="px-3 py-1 text-sm border border-blue-600 text-blue-600 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 disabled:opacity-50"
                    >
                      {testingId === config.id ? 'Gönderiliyor...' : 'Test Et'}
                    </button>
                    <button
                      onClick={() => toggleEnabled(config.id, config.enabled)}
                      className={`p-2 rounded ${
                        config.enabled
                          ? 'hover:bg-gray-100 dark:hover:bg-gray-700'
                          : 'hover:bg-green-100 dark:hover:bg-green-900/20'
                      }`}
                    >
                      {config.enabled ? (
                        <X className="text-gray-600" size={18} />
                      ) : (
                        <Check className="text-green-600" size={18} />
                      )}
                    </button>
                    <button
                      onClick={() => deleteConfig(config.id)}
                      className="p-2 hover:bg-red-100 dark:hover:bg-red-900 rounded"
                    >
                      <X className="text-red-600" size={18} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showAddModal && (
        <AddNotificationModal
          onClose={() => setShowAddModal(false)}
          onAdded={() => {
            loadConfigs();
            setShowAddModal(false);
          }}
        />
      )}
    </>
  );
}

interface AddNotificationModalProps {
  onClose: () => void;
  onAdded: () => void;
}

function AddNotificationModal({ onClose, onAdded }: AddNotificationModalProps) {
  const toast = useToast();
  const [notificationType, setNotificationType] = useState<'telegram' | 'discord'>('telegram');
  const [botToken, setBotToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<string[]>(['price_alert', 'stop_loss', 'take_profit']);
  const [saving, setSaving] = useState(false);

  function toggleEvent(eventId: string) {
    if (selectedEvents.includes(eventId)) {
      setSelectedEvents(selectedEvents.filter(e => e !== eventId));
    } else {
      setSelectedEvents([...selectedEvents, eventId]);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const config = notificationType === 'telegram'
      ? { botToken, chatId }
      : { webhookUrl };

    const { error } = await supabase.from('notification_settings').insert({
      notification_type: notificationType,
      config,
      enabled: true,
      events: selectedEvents,
    });

    if (!error) {
      onAdded();
    } else {
      toast.error('Hata: ' + error.message);
    }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Bildirim Ekle</h2>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Bildirim Tipi
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setNotificationType('telegram')}
                className={`p-4 rounded-lg border-2 flex items-center justify-center gap-2 ${
                  notificationType === 'telegram'
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-300 dark:border-gray-600'
                }`}
              >
                <Send size={20} className="text-blue-500" />
                <span className="font-semibold text-gray-900 dark:text-white">Telegram</span>
              </button>
              <button
                type="button"
                onClick={() => setNotificationType('discord')}
                className={`p-4 rounded-lg border-2 flex items-center justify-center gap-2 ${
                  notificationType === 'discord'
                    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                    : 'border-gray-300 dark:border-gray-600'
                }`}
              >
                <MessageSquare size={20} className="text-indigo-500" />
                <span className="font-semibold text-gray-900 dark:text-white">Discord</span>
              </button>
            </div>
          </div>

          {notificationType === 'telegram' ? (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Bot Token *
                </label>
                <input
                  type="text"
                  value={botToken}
                  onChange={(e) => setBotToken(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  @BotFather'dan alacağınız bot token
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Chat ID *
                </label>
                <input
                  type="text"
                  value={chatId}
                  onChange={(e) => setChatId(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="123456789"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  @userinfobot'tan öğrenebilirsiniz
                </p>
              </div>
            </>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Webhook URL *
              </label>
              <input
                type="url"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="https://discord.com/api/webhooks/..."
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Sunucu ayarlarından webhook oluşturun
              </p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Bildirim Olayları
            </label>
            <div className="space-y-2 max-h-48 overflow-y-auto border border-gray-300 dark:border-gray-600 rounded-lg p-3">
              {AVAILABLE_EVENTS.map((event) => (
                <label
                  key={event.id}
                  className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 p-2 rounded"
                >
                  <input
                    type="checkbox"
                    checked={selectedEvents.includes(event.id)}
                    onChange={() => toggleEvent(event.id)}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm text-gray-900 dark:text-white">
                    {event.icon} {event.label}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={saving || selectedEvents.length === 0}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Kaydediliyor...' : 'Ekle'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
