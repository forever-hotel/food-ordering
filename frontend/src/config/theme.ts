import type { ThemeConfig } from 'antd';

export const appTheme: ThemeConfig = {
  token: {
    colorPrimary: '#1D3557',
    colorInfo: '#1D3557',
    colorSuccess: '#10B981',
    colorWarning: '#F59E0B',
    colorError: '#EF4444',
    colorTextBase: '#1E293B',
    colorBgBase: '#FFFFFF',
    colorBgLayout: '#F8FAFC',
    fontSize: 15,
    controlHeight: 44,
    borderRadius: 10,
    fontFamily:
      'var(--font-geist-sans), -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  components: {
    Button: {
      controlHeight: 44,
      borderRadius: 10,
      fontWeight: 600,
    },
    Input: {
      controlHeight: 40,
      borderRadius: 8,
    },
    Card: {
      borderRadiusLG: 16,
    },
  },
};
