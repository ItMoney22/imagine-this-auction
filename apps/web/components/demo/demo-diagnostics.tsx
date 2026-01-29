'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Clock,
  Database,
  MemoryStick,
  RefreshCw,
  TrendingUp,
  Zap,
  Bug,
  Info,
  AlertCircle,
  XCircle
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface DemoMetrics {
  uptime_ms: number
  active_lots: number
  active_bots: number
  total_bids: number
  bid_rate_per_minute: number
  avg_lot_duration_ms: number
  anti_snipe_triggers: number
  error_rate: number
  memory_usage_mb: number
}

interface LogEntry {
  id: string
  timestamp: string
  level: 'debug' | 'info' | 'warn' | 'error' | 'critical'
  category: string
  message: string
  details?: any
  component?: string
  lot_id?: string
  user_id?: string
}

interface ErrorSummary {
  total: number
  critical: number
  recent: LogEntry[]
}

interface LogsSummary {
  total_logs: number
  total_errors: number
  critical_errors: number
  category_breakdown: Record<string, number>
  level_breakdown: Record<string, number>
}

export function DemoDiagnostics() {
  const [metrics, setMetrics] = useState<DemoMetrics | null>(null)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [errors, setErrors] = useState<ErrorSummary | null>(null)
  const [summary, setSummary] = useState<LogsSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)

  useEffect(() => {
    loadDiagnostics()

    if (autoRefresh) {
      const interval = setInterval(loadDiagnostics, 5000) // Refresh every 5 seconds
      return () => clearInterval(interval)
    }
  }, [autoRefresh])

  const loadDiagnostics = async () => {
    try {
      const [metricsRes, logsRes, errorsRes, summaryRes] = await Promise.all([
        fetch('/api/demo/logs?action=metrics'),
        fetch('/api/demo/logs?action=recent&limit=50'),
        fetch('/api/demo/logs?action=errors'),
        fetch('/api/demo/logs')
      ])

      if (metricsRes.ok) {
        const metricsData = await metricsRes.json()
        setMetrics(metricsData.metrics)
      }

      if (logsRes.ok) {
        const logsData = await logsRes.json()
        setLogs(logsData.logs)
      }

      if (errorsRes.ok) {
        const errorsData = await errorsRes.json()
        setErrors(errorsData)
      }

      if (summaryRes.ok) {
        const summaryData = await summaryRes.json()
        setSummary(summaryData.summary)
      }
    } catch (error) {
      console.error('Failed to load diagnostics:', error)
    }
  }

  const refresh = async () => {
    setLoading(true)
    await loadDiagnostics()
    setLoading(false)
  }

  const formatUptime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`
    } else {
      return `${seconds}s`
    }
  }

  const formatTimestamp = (timestamp: string): string => {
    return new Date(timestamp).toLocaleTimeString()
  }

  const getLogLevelIcon = (level: string) => {
    switch (level) {
      case 'debug':
        return <Bug className="w-3 h-3 text-gray-500" />
      case 'info':
        return <Info className="w-3 h-3 text-blue-500" />
      case 'warn':
        return <AlertTriangle className="w-3 h-3 text-yellow-500" />
      case 'error':
        return <AlertCircle className="w-3 h-3 text-red-500" />
      case 'critical':
        return <XCircle className="w-3 h-3 text-red-700" />
      default:
        return <Info className="w-3 h-3 text-gray-500" />
    }
  }

  const getLogLevelColor = (level: string): string => {
    switch (level) {
      case 'debug':
        return 'text-gray-500'
      case 'info':
        return 'text-blue-500'
      case 'warn':
        return 'text-yellow-500'
      case 'error':
        return 'text-red-500'
      case 'critical':
        return 'text-red-700'
      default:
        return 'text-gray-500'
    }
  }

  const getHealthStatus = (): { status: 'healthy' | 'warning' | 'critical'; color: string; icon: React.ReactNode } => {
    if (!metrics || !errors) {
      return { status: 'warning', color: 'text-yellow-500', icon: <AlertTriangle className="w-5 h-5" /> }
    }

    if (errors.critical > 0) {
      return { status: 'critical', color: 'text-red-500', icon: <XCircle className="w-5 h-5" /> }
    }

    if (metrics.error_rate > 10 || errors.total > 20) {
      return { status: 'warning', color: 'text-yellow-500', icon: <AlertTriangle className="w-5 h-5" /> }
    }

    return { status: 'healthy', color: 'text-green-500', icon: <CheckCircle className="w-5 h-5" /> }
  }

  const health = getHealthStatus()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Activity className="w-6 h-6" />
          <h2 className="text-2xl font-bold">Demo Diagnostics</h2>
          <div className={cn('flex items-center space-x-2', health.color)}>
            {health.icon}
            <span className="font-medium">{health.status.toUpperCase()}</span>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            {autoRefresh ? 'Auto-refresh ON' : 'Auto-refresh OFF'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={refresh}
            disabled={loading}
          >
            <RefreshCw className={cn('w-4 h-4 mr-2', loading && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>

      {/* System Metrics */}
      {metrics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <Clock className="w-6 h-6 text-blue-500" />
                <div>
                  <p className="text-sm text-muted-foreground">Uptime</p>
                  <p className="text-lg font-bold">{formatUptime(metrics.uptime_ms)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <TrendingUp className="w-6 h-6 text-green-500" />
                <div>
                  <p className="text-sm text-muted-foreground">Bid Rate</p>
                  <p className="text-lg font-bold">{metrics.bid_rate_per_minute.toFixed(1)}/min</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <Zap className="w-6 h-6 text-yellow-500" />
                <div>
                  <p className="text-sm text-muted-foreground">Anti-Snipes</p>
                  <p className="text-lg font-bold">{metrics.anti_snipe_triggers}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <MemoryStick className="w-6 h-6 text-purple-500" />
                <div>
                  <p className="text-sm text-muted-foreground">Memory</p>
                  <p className="text-lg font-bold">{metrics.memory_usage_mb}MB</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs defaultValue="logs" className="space-y-4">
        <TabsList>
          <TabsTrigger value="logs">Recent Logs</TabsTrigger>
          <TabsTrigger value="errors">Errors</TabsTrigger>
          <TabsTrigger value="metrics">Performance</TabsTrigger>
          <TabsTrigger value="summary">Summary</TabsTrigger>
        </TabsList>

        <TabsContent value="logs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Database className="w-5 h-5" />
                <span>Recent Activity ({logs.length} entries)</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-96">
                <div className="space-y-2">
                  {logs.map((log) => (
                    <div
                      key={log.id}
                      className="flex items-start space-x-3 p-2 border rounded-lg text-sm"
                    >
                      <div className="flex items-center space-x-2 min-w-0 flex-1">
                        {getLogLevelIcon(log.level)}
                        <span className="text-xs text-muted-foreground">
                          {formatTimestamp(log.timestamp)}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {log.category}
                        </Badge>
                        {log.component && (
                          <Badge variant="secondary" className="text-xs">
                            {log.component}
                          </Badge>
                        )}
                      </div>
                      <div className="flex-1">
                        <p className={cn('font-medium', getLogLevelColor(log.level))}>
                          {log.message}
                        </p>
                        {log.details && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {JSON.stringify(log.details, null, 2).slice(0, 100)}...
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="errors" className="space-y-4">
          {errors && (
            <>
              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center space-x-2">
                      <AlertTriangle className="w-6 h-6 text-yellow-500" />
                      <div>
                        <p className="text-sm text-muted-foreground">Total Errors</p>
                        <p className="text-2xl font-bold">{errors.total}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center space-x-2">
                      <XCircle className="w-6 h-6 text-red-500" />
                      <div>
                        <p className="text-sm text-muted-foreground">Critical</p>
                        <p className="text-2xl font-bold">{errors.critical}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center space-x-2">
                      <TrendingUp className="w-6 h-6 text-blue-500" />
                      <div>
                        <p className="text-sm text-muted-foreground">Error Rate</p>
                        <p className="text-2xl font-bold">
                          {metrics?.error_rate?.toFixed(1) || '0'}%
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Recent Errors</CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-64">
                    <div className="space-y-3">
                      {errors.recent.map((error) => (
                        <div
                          key={error.id}
                          className="p-3 border border-red-200 rounded-lg bg-red-50"
                        >
                          <div className="flex items-center space-x-2 mb-2">
                            {getLogLevelIcon(error.level)}
                            <span className="font-medium text-red-700">
                              {error.level.toUpperCase()}
                            </span>
                            <span className="text-sm text-red-600">
                              {formatTimestamp(error.timestamp)}
                            </span>
                            <Badge variant="outline">{error.category}</Badge>
                          </div>
                          <p className="text-sm text-red-800">{error.message}</p>
                          {error.details && (
                            <pre className="text-xs text-red-600 mt-2 overflow-x-auto">
                              {JSON.stringify(error.details, null, 2)}
                            </pre>
                          )}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="metrics" className="space-y-4">
          {metrics && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>System Performance</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="flex justify-between mb-2">
                      <span>Active Lots</span>
                      <span>{metrics.active_lots}</span>
                    </div>
                    <Progress value={(metrics.active_lots / 10) * 100} />
                  </div>

                  <div>
                    <div className="flex justify-between mb-2">
                      <span>Active Bots</span>
                      <span>{metrics.active_bots}</span>
                    </div>
                    <Progress value={(metrics.active_bots / 20) * 100} />
                  </div>

                  <div>
                    <div className="flex justify-between mb-2">
                      <span>Memory Usage</span>
                      <span>{metrics.memory_usage_mb}MB</span>
                    </div>
                    <Progress value={(metrics.memory_usage_mb / 512) * 100} />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Auction Activity</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between">
                    <span>Total Bids</span>
                    <span className="font-bold">{metrics.total_bids.toLocaleString()}</span>
                  </div>

                  <div className="flex justify-between">
                    <span>Bid Rate</span>
                    <span className="font-bold">{metrics.bid_rate_per_minute.toFixed(1)}/min</span>
                  </div>

                  <div className="flex justify-between">
                    <span>Avg Lot Duration</span>
                    <span className="font-bold">
                      {Math.round(metrics.avg_lot_duration_ms / 1000)}s
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span>Anti-Snipe Triggers</span>
                    <span className="font-bold">{metrics.anti_snipe_triggers}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="summary" className="space-y-4">
          {summary && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Log Categories</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {Object.entries(summary.category_breakdown).map(([category, count]) => (
                      <div key={category} className="flex justify-between">
                        <span className="capitalize">{category.replace('_', ' ')}</span>
                        <span className="font-bold">{count}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Log Levels</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {Object.entries(summary.level_breakdown).map(([level, count]) => (
                      <div key={level} className="flex justify-between">
                        <div className="flex items-center space-x-2">
                          {getLogLevelIcon(level)}
                          <span className={cn('capitalize', getLogLevelColor(level))}>
                            {level}
                          </span>
                        </div>
                        <span className="font-bold">{count}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default DemoDiagnostics