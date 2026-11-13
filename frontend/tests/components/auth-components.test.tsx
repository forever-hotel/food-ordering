import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ConfigProvider, App } from 'antd';
import { appTheme } from '../../src/config/theme';
import { ManualEntryForm } from '../../src/features/auth/components/manual-entry-form';
import { QrScanCard } from '../../src/features/auth/components/qr-scan-card';
import { QrScannerModal } from '../../src/features/auth/components/qr-scanner-modal';
import { DemoModeToolbar } from '../../src/components/demo/demo-mode-toolbar';
import { NavigationProvider } from '../../src/lib/navigation/navigation-context';
import { CartProvider } from '../../src/lib/cart/cart-context';

let mockZxingCallback:
  | ((
      result: { getText: () => string } | undefined,
      error?: unknown,
      controls?: { stop: () => void },
    ) => void)
  | null = null;
const mockZxingStop = jest.fn();

jest.mock('@zxing/browser', () => {
  return {
    BrowserQRCodeReader: jest.fn().mockImplementation(() => ({
      decodeFromVideoElement: jest.fn().mockImplementation((_video: unknown, callback: any) => {
        mockZxingCallback = callback;
        return Promise.resolve({
          stop: mockZxingStop,
        });
      }),
    })),
  };
});

let mockAuthContext = {
  status: 'idle',
  sessionToken: null as string | null,
  guest: null as unknown,
  expiresAt: null as string | null,
  error: null as string | null,
  demoTokens: {
    '101 - Active Stay': 'demo-token-101',
    '204 - Active Stay': 'demo-token-204',
  } as Record<string, string>,
  loginWithQr: jest.fn().mockResolvedValue(true),
  logout: jest.fn().mockResolvedValue(undefined),
  clearError: jest.fn(),
  refreshSession: jest.fn(),
};

jest.mock('../../src/lib/auth/auth-context', () => {
  const actual = jest.requireActual('../../src/lib/auth/auth-context');
  return {
    ...actual,
    useAuth: () => mockAuthContext,
  };
});

jest.mock('../../src/lib/data-mode/data-mode', () => {
  const actual = jest.requireActual('../../src/lib/data-mode/data-mode');
  return {
    ...actual,
    isDemoAllowed: () => true,
    isProduction: () => false,
    getDataMode: () => 'demo',
  };
});

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <ConfigProvider theme={appTheme}>
      <App>
        <NavigationProvider>
          <CartProvider>{children}</CartProvider>
        </NavigationProvider>
      </App>
    </ConfigProvider>
  );
}

describe('ManualEntryForm Component', () => {
  it('enforces security rule: room number alone is rejected unless matching demo token', () => {
    const onSubmit = jest.fn();
    render(
      <Wrapper>
        <ManualEntryForm loading={false} onSubmit={onSubmit} demoTokens={{}} />
      </Wrapper>,
    );

    const input = screen.getByPlaceholderText(/Enter room code manually/i);
    fireEvent.change(input, { target: { value: '999' } });

    const submitBtn = screen.getByRole('button', { name: 'Go' });
    fireEvent.click(submitBtn);

    // Should NOT submit naked room number without token
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits valid full access token or QR code string', () => {
    const onSubmit = jest.fn();
    render(
      <Wrapper>
        <ManualEntryForm loading={false} onSubmit={onSubmit} demoTokens={{}} />
      </Wrapper>,
    );

    const input = screen.getByPlaceholderText(/Enter room code manually/i);
    fireEvent.change(input, { target: { value: 'valid-qr-token-xyz-1234' } });

    const submitBtn = screen.getByRole('button', { name: 'Go' });
    fireEvent.click(submitBtn);

    expect(onSubmit).toHaveBeenCalledWith('valid-qr-token-xyz-1234');
  });

  it('resolves demo room number to pre-signed demo token', () => {
    const onSubmit = jest.fn();
    render(
      <Wrapper>
        <ManualEntryForm
          loading={false}
          onSubmit={onSubmit}
          demoTokens={{ '101 - Alice': 'demo-token-101' }}
        />
      </Wrapper>,
    );

    const input = screen.getByPlaceholderText(/Enter room code manually/i);
    fireEvent.change(input, { target: { value: '101' } });

    const submitBtn = screen.getByRole('button', { name: 'Go' });
    fireEvent.click(submitBtn);

    expect(onSubmit).toHaveBeenCalledWith('demo-token-101');
  });

  it('warns when submitting empty input and allows selecting demo chips', () => {
    const onSubmit = jest.fn();
    render(
      <Wrapper>
        <ManualEntryForm
          loading={false}
          onSubmit={onSubmit}
          demoTokens={{ '201 - Bob': 'demo-token-201' }}
        />
      </Wrapper>,
    );

    // Empty submission
    const submitBtn = screen.getByRole('button', { name: 'Go' });
    fireEvent.click(submitBtn);
    expect(onSubmit).not.toHaveBeenCalled();

    // Toggle demo chips
    const toggleChipsBtn = screen.getByRole('button', { name: /Quick demo access codes/i });
    fireEvent.click(toggleChipsBtn);

    expect(screen.getByRole('button', { name: /Hide demo codes/i })).toBeDefined();
    expect(screen.getByRole('button', { name: '201 - Bob' })).toBeDefined();

    // Click demo chip
    fireEvent.click(screen.getByRole('button', { name: '201 - Bob' }));
    expect(onSubmit).toHaveBeenCalledWith('demo-token-201');
  });
});

describe('QrScanCard Component', () => {
  beforeEach(() => {
    mockAuthContext = {
      status: 'idle',
      sessionToken: null,
      guest: null,
      expiresAt: null,
      error: null,
      demoTokens: { '101 - Alice': 'demo-token-101' },
      loginWithQr: jest.fn().mockResolvedValue(true),
      logout: jest.fn().mockResolvedValue(undefined),
      clearError: jest.fn(),
      refreshSession: jest.fn(),
    };
  });

  it('renders FOREVER HOTEL brand header and scan QR trigger', () => {
    render(
      <Wrapper>
        <QrScanCard />
      </Wrapper>,
    );

    expect(screen.getByText('FOREVER HOTEL')).toBeDefined();
    expect(screen.getByRole('button', { name: /Open Camera/i })).toBeDefined();
  });

  it('displays session expired alert banner when status is expired', () => {
    mockAuthContext.status = 'expired';
    mockAuthContext.error = 'Guest session expired following checkout';

    render(
      <Wrapper>
        <QrScanCard />
      </Wrapper>,
    );

    expect(screen.getAllByText(/Session Expired/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Guest session expired following checkout/i)).toBeDefined();
  });
});

describe('QrScannerModal Component', () => {
  it('renders modal with camera instructions and allows close', () => {
    let closed = false;

    render(
      <Wrapper>
        <QrScannerModal
          open={true}
          onClose={() => {
            closed = true;
          }}
          onScan={() => {}}
        />
      </Wrapper>,
    );

    expect(screen.getByText('Scan Room QR Code')).toBeDefined();
    expect(screen.getByText(/Accessing camera/i)).toBeDefined();

    // Close button
    const closeBtn = screen.getByRole('button', { name: /Close Scanner/i });
    fireEvent.click(closeBtn);
    expect(closed).toBe(true);
  });

  it('allows clicking demo tokens to simulate scan and parses URL tokens', () => {
    let scannedToken = '';
    let closed = false;
    window.sessionStorage.setItem('foss_data_mode', 'demo');

    render(
      <Wrapper>
        <QrScannerModal
          open={true}
          onClose={() => {
            closed = true;
          }}
          onScan={(t) => {
            scannedToken = t;
          }}
          demoTokens={{ 'Room 101': 'https://hotel.com/activate?token=extracted-alice-token' }}
        />
      </Wrapper>,
    );

    const demoBtn = screen.getByRole('button', { name: /Scan Room 101/i });
    fireEvent.click(demoBtn);

    expect(scannedToken).toBe('extracted-alice-token');
    expect(closed).toBe(true);
  });

  it('displays permission denied alert when camera access is rejected', async () => {
    const originalMediaDevices = navigator.mediaDevices;
    Object.defineProperty(navigator, 'mediaDevices', {
      writable: true,
      value: {
        getUserMedia: jest.fn().mockRejectedValue({ name: 'NotAllowedError' }),
      },
    });

    render(
      <Wrapper>
        <QrScannerModal open={true} onClose={() => {}} onScan={() => {}} />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Camera permission was denied/i)).toBeDefined();
    });

    Object.defineProperty(navigator, 'mediaDevices', {
      writable: true,
      value: originalMediaDevices,
    });
  });

  it('displays device not found and unsupported camera states', async () => {
    const originalMediaDevices = navigator.mediaDevices;
    Object.defineProperty(navigator, 'mediaDevices', {
      writable: true,
      value: {
        getUserMedia: jest.fn().mockRejectedValue({ name: 'NotFoundError' }),
      },
    });

    const { rerender } = render(
      <Wrapper>
        <QrScannerModal open={true} onClose={() => {}} onScan={() => {}} />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText(/No camera device was detected/i)).toBeDefined();
    });

    // Test generic error
    Object.defineProperty(navigator, 'mediaDevices', {
      writable: true,
      value: {
        getUserMedia: jest.fn().mockRejectedValue(new Error('Hardware sensor fault')),
      },
    });

    rerender(
      <Wrapper>
        <QrScannerModal open={true} onClose={() => {}} onScan={() => {}} />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Unable to access camera: Hardware sensor fault/i)).toBeDefined();
    });

    Object.defineProperty(navigator, 'mediaDevices', {
      writable: true,
      value: originalMediaDevices,
    });
  });

  it('parses qrToken query parameter and extracts token', () => {
    let scannedToken = '';
    window.sessionStorage.setItem('foss_data_mode', 'demo');

    render(
      <Wrapper>
        <QrScannerModal
          open={true}
          onClose={() => {}}
          onScan={(t) => {
            scannedToken = t;
          }}
          demoTokens={{ 'Room 102': 'https://hotel.com/activate?qrToken=token-with-qrToken-param' }}
        />
      </Wrapper>,
    );

    const demoBtn = screen.getByRole('button', { name: /Scan Room 102/i });
    fireEvent.click(demoBtn);

    expect(scannedToken).toBe('token-with-qrToken-param');
  });

  it('activates live camera viewfinder when getUserMedia resolves', async () => {
    const mockTrack = { stop: jest.fn() };
    const mockStream = {
      getTracks: () => [mockTrack],
    };
    const originalMediaDevices = navigator.mediaDevices;
    Object.defineProperty(navigator, 'mediaDevices', {
      writable: true,
      value: {
        getUserMedia: jest.fn().mockResolvedValue(mockStream),
      },
    });

    render(
      <Wrapper>
        <QrScannerModal open={true} onClose={() => {}} onScan={() => {}} />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Align printed QR code inside frame/i)).toBeDefined();
    });

    Object.defineProperty(navigator, 'mediaDevices', {
      writable: true,
      value: originalMediaDevices,
    });
  });

  it('detects QR code via native BarcodeDetector loop', async () => {
    let detectedToken = '';
    const mockTrack = { stop: jest.fn() };
    const mockStream = { getTracks: () => [mockTrack] };
    const originalMediaDevices = navigator.mediaDevices;
    Object.defineProperty(navigator, 'mediaDevices', {
      writable: true,
      value: {
        getUserMedia: jest.fn().mockResolvedValue(mockStream),
      },
    });

    const origReadyState = Object.getOwnPropertyDescriptor(
      HTMLMediaElement.prototype,
      'readyState',
    );
    Object.defineProperty(HTMLMediaElement.prototype, 'readyState', {
      value: 4,
      configurable: true,
    });
    Object.defineProperty(HTMLVideoElement.prototype, 'readyState', {
      value: 4,
      configurable: true,
    });

    const mockDetect = jest
      .fn()
      .mockResolvedValue([{ rawValue: 'https://hotel.com/activate?token=native-qr-pass' }]);
    function MockBarcodeDetector(this: any) {
      this.detect = mockDetect;
    }
    (window as any).BarcodeDetector = MockBarcodeDetector;

    render(
      <Wrapper>
        <QrScannerModal
          open={true}
          onClose={() => {}}
          onScan={(token) => {
            detectedToken = token;
          }}
        />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(mockDetect).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(detectedToken).toBe('native-qr-pass');
    });

    delete (window as any).BarcodeDetector;
    if (origReadyState) {
      Object.defineProperty(HTMLMediaElement.prototype, 'readyState', origReadyState);
    }
    Object.defineProperty(navigator, 'mediaDevices', {
      writable: true,
      value: originalMediaDevices,
    });
  });

  it('handles generic camera access error and displays error alert', async () => {
    const originalMediaDevices = navigator.mediaDevices;
    Object.defineProperty(navigator, 'mediaDevices', {
      writable: true,
      value: {
        getUserMedia: jest.fn().mockRejectedValue(new Error('Hardware failure')),
      },
    });

    render(
      <Wrapper>
        <QrScannerModal open={true} onClose={() => {}} onScan={() => {}} />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Unable to access camera: Hardware failure/i)).toBeDefined();
    });

    Object.defineProperty(navigator, 'mediaDevices', {
      writable: true,
      value: originalMediaDevices,
    });
  });

  it('scans expired stay QR and parses http url tokens', () => {
    let scannedToken = '';
    window.sessionStorage.setItem('foss_data_mode', 'demo');

    render(
      <Wrapper>
        <QrScannerModal
          open={true}
          onClose={() => {}}
          onScan={(t) => {
            scannedToken = t;
          }}
          demoTokens={{
            '105-expired-window': 'http://hotel.com/activate?qrToken=expired-http-token',
          }}
        />
      </Wrapper>,
    );

    const expiredBtn = screen.getByRole('button', { name: /Scan Expired Stay QR/i });
    fireEvent.click(expiredBtn);

    expect(scannedToken).toBe('expired-http-token');
  });

  it('attaches MediaStream to video.srcObject and invokes video.play() on camera initialization', async () => {
    const mockTrack = { stop: jest.fn() };
    const mockStream = { getTracks: () => [mockTrack] };
    const originalMediaDevices = navigator.mediaDevices;
    Object.defineProperty(navigator, 'mediaDevices', {
      writable: true,
      value: {
        getUserMedia: jest.fn().mockResolvedValue(mockStream),
      },
    });

    const origPlay = HTMLVideoElement.prototype.play;
    const playMock = jest.fn().mockResolvedValue(undefined);
    HTMLVideoElement.prototype.play = playMock;

    render(
      <Wrapper>
        <QrScannerModal open={true} onClose={() => {}} onScan={() => {}} />
      </Wrapper>,
    );

    await waitFor(() => {
      const video = document.querySelector('video');
      expect(video).not.toBeNull();
      expect(video?.srcObject).toBe(mockStream);
      expect(playMock).toHaveBeenCalled();
    });

    HTMLVideoElement.prototype.play = origPlay;
    Object.defineProperty(navigator, 'mediaDevices', {
      writable: true,
      value: originalMediaDevices,
    });
  });

  it('displays error alert when video.play() rejects (playback failure)', async () => {
    const mockTrack = { stop: jest.fn() };
    const mockStream = { getTracks: () => [mockTrack] };
    const originalMediaDevices = navigator.mediaDevices;
    Object.defineProperty(navigator, 'mediaDevices', {
      writable: true,
      value: {
        getUserMedia: jest.fn().mockResolvedValue(mockStream),
      },
    });

    const origPlay = HTMLVideoElement.prototype.play;
    HTMLVideoElement.prototype.play = jest
      .fn()
      .mockRejectedValue(new Error('Autoplay policy denied'));

    render(
      <Wrapper>
        <QrScannerModal open={true} onClose={() => {}} onScan={() => {}} />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(
        screen.getByText(/Failed to start camera preview: Autoplay policy denied/i),
      ).toBeDefined();
    });

    HTMLVideoElement.prototype.play = origPlay;
    Object.defineProperty(navigator, 'mediaDevices', {
      writable: true,
      value: originalMediaDevices,
    });
  });

  it('displays hardware in use error when getUserMedia rejects with NotReadableError', async () => {
    const originalMediaDevices = navigator.mediaDevices;
    Object.defineProperty(navigator, 'mediaDevices', {
      writable: true,
      value: {
        getUserMedia: jest.fn().mockRejectedValue({ name: 'NotReadableError' }),
      },
    });

    render(
      <Wrapper>
        <QrScannerModal open={true} onClose={() => {}} onScan={() => {}} />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(
        screen.getByText(/Camera hardware is in use by another application or failed to start/i),
      ).toBeDefined();
    });

    Object.defineProperty(navigator, 'mediaDevices', {
      writable: true,
      value: originalMediaDevices,
    });
  });

  it('displays HTTPS required error when getUserMedia rejects with SecurityError', async () => {
    const originalMediaDevices = navigator.mediaDevices;
    Object.defineProperty(navigator, 'mediaDevices', {
      writable: true,
      value: {
        getUserMedia: jest.fn().mockRejectedValue({ name: 'SecurityError' }),
      },
    });

    render(
      <Wrapper>
        <QrScannerModal open={true} onClose={() => {}} onScan={() => {}} />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Camera access requires a secure HTTPS connection/i)).toBeDefined();
    });

    Object.defineProperty(navigator, 'mediaDevices', {
      writable: true,
      value: originalMediaDevices,
    });
  });

  it('detects QR code via cross-browser fallback (@zxing/browser) when native BarcodeDetector is unavailable', async () => {
    delete (window as any).BarcodeDetector;
    let detectedToken = '';
    let closed = false;
    mockZxingCallback = null;
    mockZxingStop.mockClear();

    const mockTrack = { stop: jest.fn() };
    const mockStream = { getTracks: () => [mockTrack] };
    const originalMediaDevices = navigator.mediaDevices;
    Object.defineProperty(navigator, 'mediaDevices', {
      writable: true,
      value: {
        getUserMedia: jest.fn().mockResolvedValue(mockStream),
      },
    });

    render(
      <Wrapper>
        <QrScannerModal
          open={true}
          onClose={() => {
            closed = true;
          }}
          onScan={(token) => {
            detectedToken = token;
          }}
        />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(mockZxingCallback).not.toBeNull();
    });

    act(() => {
      mockZxingCallback?.(
        { getText: () => 'https://hotel.com/activate?token=zxing-safari-pass' },
        undefined,
        { stop: mockZxingStop },
      );
    });

    expect(detectedToken).toBe('zxing-safari-pass');
    expect(closed).toBe(true);
    expect(mockZxingStop).toHaveBeenCalled();
    expect(mockTrack.stop).toHaveBeenCalled();

    Object.defineProperty(navigator, 'mediaDevices', {
      writable: true,
      value: originalMediaDevices,
    });
  });

  it('prevents duplicate scan callbacks when multiple decode events occur', async () => {
    delete (window as any).BarcodeDetector;
    const onScan = jest.fn();
    mockZxingCallback = null;
    mockZxingStop.mockClear();

    const mockTrack = { stop: jest.fn() };
    const mockStream = { getTracks: () => [mockTrack] };
    const originalMediaDevices = navigator.mediaDevices;
    Object.defineProperty(navigator, 'mediaDevices', {
      writable: true,
      value: {
        getUserMedia: jest.fn().mockResolvedValue(mockStream),
      },
    });

    render(
      <Wrapper>
        <QrScannerModal open={true} onClose={() => {}} onScan={onScan} />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(mockZxingCallback).not.toBeNull();
    });

    act(() => {
      mockZxingCallback?.({ getText: () => 'token-first-pass' }, undefined, {
        stop: mockZxingStop,
      });
      mockZxingCallback?.({ getText: () => 'token-second-pass' }, undefined, {
        stop: mockZxingStop,
      });
    });

    expect(onScan).toHaveBeenCalledTimes(1);
    expect(onScan).toHaveBeenCalledWith('token-first-pass');

    Object.defineProperty(navigator, 'mediaDevices', {
      writable: true,
      value: originalMediaDevices,
    });
  });

  it('stops all tracks and releases video stream when closed via Close button', async () => {
    let closed = false;
    const mockTrack = { stop: jest.fn() };
    const mockStream = { getTracks: () => [mockTrack] };
    const originalMediaDevices = navigator.mediaDevices;
    Object.defineProperty(navigator, 'mediaDevices', {
      writable: true,
      value: {
        getUserMedia: jest.fn().mockResolvedValue(mockStream),
      },
    });

    render(
      <Wrapper>
        <QrScannerModal
          open={true}
          onClose={() => {
            closed = true;
          }}
          onScan={() => {}}
        />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Align printed QR code inside frame/i)).toBeDefined();
    });

    const closeBtn = screen.getByRole('button', { name: /Close Scanner/i });
    fireEvent.click(closeBtn);

    expect(closed).toBe(true);
    expect(mockTrack.stop).toHaveBeenCalled();

    Object.defineProperty(navigator, 'mediaDevices', {
      writable: true,
      value: originalMediaDevices,
    });
  });

  it('reopens scanner and initializes a fresh stream after closing', async () => {
    const mockTrack1 = { stop: jest.fn() };
    const mockStream1 = { getTracks: () => [mockTrack1] };
    const mockTrack2 = { stop: jest.fn() };
    const mockStream2 = { getTracks: () => [mockTrack2] };

    const getUserMediaMock = jest
      .fn()
      .mockResolvedValueOnce(mockStream1)
      .mockResolvedValueOnce(mockStream2);

    const originalMediaDevices = navigator.mediaDevices;
    Object.defineProperty(navigator, 'mediaDevices', {
      writable: true,
      value: {
        getUserMedia: getUserMediaMock,
      },
    });

    const { rerender } = render(
      <Wrapper>
        <QrScannerModal open={true} onClose={() => {}} onScan={() => {}} />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Align printed QR code inside frame/i)).toBeDefined();
    });

    // Close modal
    rerender(
      <Wrapper>
        <QrScannerModal open={false} onClose={() => {}} onScan={() => {}} />
      </Wrapper>,
    );

    expect(mockTrack1.stop).toHaveBeenCalled();

    // Reopen modal
    rerender(
      <Wrapper>
        <QrScannerModal open={true} onClose={() => {}} onScan={() => {}} />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(getUserMediaMock).toHaveBeenCalledTimes(2);
      expect(screen.getByText(/Align printed QR code inside frame/i)).toBeDefined();
    });

    Object.defineProperty(navigator, 'mediaDevices', {
      writable: true,
      value: originalMediaDevices,
    });
  });

  it('cancels camera initialization and stops tracks if modal is closed before getUserMedia resolves', async () => {
    const mockTrack = { stop: jest.fn() };
    const mockStream = { getTracks: () => [mockTrack] };

    let resolveGetUserMedia: (stream: any) => void = () => {};
    const pendingPromise = new Promise((resolve) => {
      resolveGetUserMedia = resolve;
    });

    const getUserMediaMock = jest.fn().mockReturnValue(pendingPromise);
    const originalMediaDevices = navigator.mediaDevices;
    Object.defineProperty(navigator, 'mediaDevices', {
      writable: true,
      value: {
        getUserMedia: getUserMediaMock,
      },
    });

    const { rerender } = render(
      <Wrapper>
        <QrScannerModal open={true} onClose={() => {}} onScan={() => {}} />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(getUserMediaMock).toHaveBeenCalled();
    });

    // Close modal while getUserMedia is still pending
    rerender(
      <Wrapper>
        <QrScannerModal open={false} onClose={() => {}} onScan={() => {}} />
      </Wrapper>,
    );

    // Now resolve getUserMedia
    await act(async () => {
      resolveGetUserMedia(mockStream);
    });

    // Tracks should be stopped immediately
    await waitFor(() => {
      expect(mockTrack.stop).toHaveBeenCalled();
    });

    Object.defineProperty(navigator, 'mediaDevices', {
      writable: true,
      value: originalMediaDevices,
    });
  });

  it('cleans up all media stream tracks when component unmounts', async () => {
    const mockTrack = { stop: jest.fn() };
    const mockStream = { getTracks: () => [mockTrack] };
    const originalMediaDevices = navigator.mediaDevices;
    Object.defineProperty(navigator, 'mediaDevices', {
      writable: true,
      value: {
        getUserMedia: jest.fn().mockResolvedValue(mockStream),
      },
    });

    const { unmount } = render(
      <Wrapper>
        <QrScannerModal open={true} onClose={() => {}} onScan={() => {}} />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Align printed QR code inside frame/i)).toBeDefined();
    });

    unmount();

    expect(mockTrack.stop).toHaveBeenCalled();

    Object.defineProperty(navigator, 'mediaDevices', {
      writable: true,
      value: originalMediaDevices,
    });
  });
});

describe('DemoModeToolbar Component', () => {
  it('renders demo mode badge, expands, resets demo, and collapses toolbar', async () => {
    mockAuthContext.demoTokens = {
      'Room 201 - VIP': 'token-room-201',
      'Room 202 - Expired': 'token-room-202-exp',
    };
    mockAuthContext.guest = {
      bookingId: 'BK-DEMO-1',
      roomNumber: '201',
      guestName: 'VIP Guest',
    };

    render(
      <Wrapper>
        <DemoModeToolbar />
      </Wrapper>,
    );

    // Click toggle button to expand toolbar
    const devBtn = screen.getByRole('button', { name: /Toggle developer toolbar/i });
    fireEvent.click(devBtn);

    expect(screen.getByText(/MOCK DEMO/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /Reset Demo/i })).toBeDefined();

    // Click Logout button inside toolbar
    const logoutBtn = screen.getByRole('button', { name: /^Logout$/i });
    fireEvent.click(logoutBtn);
    expect(mockAuthContext.logout).toHaveBeenCalled();

    // Click Reset Demo button
    const resetBtn = screen.getByRole('button', { name: /Reset Demo/i });
    fireEvent.click(resetBtn);

    // Collapse toolbar
    const closeToolbarBtn = screen.getByRole('button', { name: /Close developer toolbar/i });
    fireEvent.click(closeToolbarBtn);

    expect(screen.getByRole('button', { name: /Toggle developer toolbar/i })).toBeDefined();
  });

  it('renders LIVE API mode when data mode is api', () => {
    const dataModeModule = jest.requireMock('../../src/lib/data-mode/data-mode');
    const originalGetDataMode = dataModeModule.getDataMode;
    dataModeModule.getDataMode = () => 'api';

    mockAuthContext.guest = null;

    render(
      <Wrapper>
        <DemoModeToolbar />
      </Wrapper>,
    );

    // Expand
    const devBtn = screen.getByRole('button', { name: /Toggle developer toolbar/i });
    fireEvent.click(devBtn);

    expect(screen.getByText(/LIVE API/i)).toBeDefined();
    expect(screen.getByText(/QR Scan Required/i)).toBeDefined();

    dataModeModule.getDataMode = originalGetDataMode;
  });

  it('renders guest room label and empty roomMenuItems fallback in DemoModeToolbar', () => {
    // 1. With guest
    mockAuthContext.demoTokens = {
      'Room 301 - Checked In': 'token-301',
    };
    mockAuthContext.guest = {
      bookingId: 'BK-301',
      roomNumber: '301',
      guestName: 'Arthur Dent',
    };

    const { rerender } = render(
      <Wrapper>
        <DemoModeToolbar />
      </Wrapper>,
    );

    // Expand toolbar
    const devBtn = screen.getByRole('button', { name: /Toggle developer toolbar/i });
    fireEvent.click(devBtn);

    expect(screen.getByText(/Rm 301 \(Arthur Dent\)/i)).toBeDefined();

    // 2. Without roomMenuItems (empty demoTokens)
    mockAuthContext.demoTokens = {};
    mockAuthContext.guest = null;

    rerender(
      <Wrapper>
        <DemoModeToolbar />
      </Wrapper>,
    );

    expect(screen.getByText(/QR Scan Required/i)).toBeDefined();
  });

  it('handles selecting stay scenarios in DemoModeToolbar', async () => {
    mockAuthContext.demoTokens = {
      'Room 201 - VIP': 'token-room-201',
      'Room 202 - Expired': 'token-room-202-exp',
    };
    mockAuthContext.guest = null;
    (mockAuthContext.loginWithQr as jest.Mock).mockResolvedValueOnce(true);

    render(
      <Wrapper>
        <DemoModeToolbar />
      </Wrapper>,
    );

    // Expand toolbar
    fireEvent.click(screen.getByRole('button', { name: /Toggle developer toolbar/i }));

    const stayBtn = screen.getByRole('button', { name: /Stay: Select Mock Stay/i });
    fireEvent.mouseEnter(stayBtn);
    fireEvent.click(stayBtn);

    // Click Room 201 - VIP in dropdown
    await waitFor(() => {
      expect(screen.getByText('Room 201 - VIP')).toBeDefined();
    });
    fireEvent.click(screen.getByText('Room 201 - VIP'));

    await waitFor(() => {
      expect(mockAuthContext.loginWithQr).toHaveBeenCalledWith('token-room-201');
    });

    // Test expired stay scenario
    (mockAuthContext.loginWithQr as jest.Mock).mockResolvedValueOnce(false);
    fireEvent.click(stayBtn);
    await waitFor(() => {
      expect(screen.getByText('Room 202 - Expired')).toBeDefined();
    });
    fireEvent.click(screen.getByText('Room 202 - Expired'));

    await waitFor(() => {
      expect(mockAuthContext.loginWithQr).toHaveBeenCalledWith('token-room-202-exp');
    });
  });
});
