'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button, Card, Typography } from 'antd';

const { Title, Paragraph, Text } = Typography;

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public override state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Structured logging without exposing sensitive guest PII
    if (process.env.NODE_ENV !== 'production') {
      console.error('ErrorBoundary caught an error:', error, errorInfo);
    }
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  private handleReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  public override render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          aria-live="assertive"
          className="w-full max-w-md mx-auto p-4 py-8 flex flex-col items-center justify-center min-h-[50vh]"
        >
          <Card
            className="w-full !rounded-[10px] !shadow-none !border-[#ddd8cf] text-center !bg-white"
            styles={{ body: { padding: '28px 20px' } }}
          >
            <div className="w-14 h-14 rounded-full bg-red-50 text-red-500 mx-auto mb-4 flex items-center justify-center text-2xl font-semibold">
              ⚠️
            </div>

            <Title level={2} className="!text-lg !font-semibold !text-[#1a1a18] !mb-2">
              {this.props.fallbackTitle || 'Something went wrong'}
            </Title>

            <Paragraph className="!text-[#5a5650] !text-sm !mb-6 leading-relaxed">
              We encountered an unexpected issue displaying this section. Your active stay and
              existing orders are safe.
            </Paragraph>

            <div className="flex flex-col gap-2.5 w-full">
              <Button
                type="primary"
                onClick={this.handleReset}
                className="w-full !h-11 !rounded-[10px] !bg-[#1a3c5e] hover:!bg-[#12263a] !font-semibold text-sm"
              >
                Try Again
              </Button>
              <Button
                onClick={this.handleReload}
                className="w-full !h-11 !rounded-[10px] text-[#5a5650] text-sm"
              >
                Reload Page
              </Button>
            </div>

            {process.env.NODE_ENV !== 'production' && this.state.error && (
              <details className="mt-4 text-left text-xs text-[#5a5650] bg-[#f9f7f4] p-2.5 rounded-lg border border-[#ddd8cf] overflow-auto max-h-32">
                <summary className="cursor-pointer font-mono font-medium text-[#5a5650]">
                  Developer Error Details
                </summary>
                <Text className="font-mono block mt-1">{this.state.error.message}</Text>
              </details>
            )}
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
