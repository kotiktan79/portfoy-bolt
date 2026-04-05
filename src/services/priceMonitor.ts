interface APIHealth {
  service: string;
  status: 'healthy' | 'degraded' | 'down';
  lastCheck: number;
  successRate: number;
  avgResponseTime: number;
  consecutiveFailures: number;
}

interface APICallResult {
  success: boolean;
  responseTime: number;
  timestamp: number;
}

const apiHealthStatus: Map<string, APIHealth> = new Map();
const apiCallHistory: Map<string, APICallResult[]> = new Map();
const MAX_HISTORY = 20;
const HEALTH_CHECK_INTERVAL = 60000;

export function recordAPICall(service: string, success: boolean, responseTime: number) {
  if (!apiCallHistory.has(service)) {
    apiCallHistory.set(service, []);
  }

  const history = apiCallHistory.get(service)!;
  history.push({
    success,
    responseTime,
    timestamp: Date.now(),
  });

  if (history.length > MAX_HISTORY) {
    history.shift();
  }

  updateHealthStatus(service);
}

function updateHealthStatus(service: string) {
  const history = apiCallHistory.get(service) || [];

  if (history.length === 0) {
    return;
  }

  const recentCalls = history.slice(-10);
  const successCount = recentCalls.filter(call => call.success).length;
  const successRate = successCount / recentCalls.length;

  const avgResponseTime = recentCalls
    .filter(call => call.success)
    .reduce((sum, call) => sum + call.responseTime, 0) / (successCount || 1);

  const consecutiveFailures = history
    .slice()
    .reverse()
    .findIndex(call => call.success);

  let status: 'healthy' | 'degraded' | 'down' = 'healthy';

  if (successRate < 0.3 || consecutiveFailures >= 5) {
    status = 'down';
  } else if (successRate < 0.7 || avgResponseTime > 5000 || consecutiveFailures >= 3) {
    status = 'degraded';
  }

  apiHealthStatus.set(service, {
    service,
    status,
    lastCheck: Date.now(),
    successRate,
    avgResponseTime,
    consecutiveFailures: consecutiveFailures === -1 ? 0 : consecutiveFailures,
  });
}

export function getAPIHealth(service: string): APIHealth | null {
  return apiHealthStatus.get(service) || null;
}

export function getAllAPIHealth(): APIHealth[] {
  return Array.from(apiHealthStatus.values());
}

export function shouldUseService(service: string): boolean {
  const health = apiHealthStatus.get(service);

  if (!health) {
    return true;
  }

  if (health.status === 'down') {
    const timeSinceLastCheck = Date.now() - health.lastCheck;
    return timeSinceLastCheck > 300000;
  }

  return true;
}

export async function trackAPICall<T>(
  service: string,
  apiCall: () => Promise<T>
): Promise<T> {
  const startTime = Date.now();

  try {
    const result = await apiCall();
    const responseTime = Date.now() - startTime;
    recordAPICall(service, true, responseTime);
    return result;
  } catch (error) {
    const responseTime = Date.now() - startTime;
    recordAPICall(service, false, responseTime);
    throw error;
  }
}

let healthCheckInterval: NodeJS.Timeout | null = null;

export function startHealthMonitoring() {
  if (healthCheckInterval) {
    return;
  }

  healthCheckInterval = setInterval(() => {
    const now = Date.now();

    apiHealthStatus.forEach((health, service) => {
      if (now - health.lastCheck > HEALTH_CHECK_INTERVAL) {
        updateHealthStatus(service);
      }
    });
  }, HEALTH_CHECK_INTERVAL);
}

export function stopHealthMonitoring() {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
  }
}

export function getHealthSummary(): {
  total: number;
  healthy: number;
  degraded: number;
  down: number;
} {
  const statuses = Array.from(apiHealthStatus.values());

  return {
    total: statuses.length,
    healthy: statuses.filter(s => s.status === 'healthy').length,
    degraded: statuses.filter(s => s.status === 'degraded').length,
    down: statuses.filter(s => s.status === 'down').length,
  };
}
