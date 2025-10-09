export class SearchConsoleAPI {
  static async getPerformanceData(dateRange: string): Promise<any> {
    // Mock implementation - replace with actual Google Search Console API
    const days = dateRange === '7days' ? 7 : dateRange === '28days' ? 28 : 90;
    
    const dates = [];
    const clicks = [];
    const impressions = [];
    
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      dates.push(date.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' }));
      clicks.push(Math.floor(Math.random() * 500) + 100);
      impressions.push(Math.floor(Math.random() * 5000) + 1000);
    }
    
    return {
      dates,
      clicks,
      impressions,
      byPage: {
        '/articles/seo-basics': {
          position: 3,
          clicks: 1250,
          impressions: 15000,
          ctr: 0.083,
          weeklyPositionChange: -2,
          monthlyPositionChange: -5
        },
        '/articles/sample-1': {
          position: 8,
          clicks: 450,
          impressions: 8000,
          ctr: 0.056,
          weeklyPositionChange: 1,
          monthlyPositionChange: -3
        }
      }
    };
  }
}