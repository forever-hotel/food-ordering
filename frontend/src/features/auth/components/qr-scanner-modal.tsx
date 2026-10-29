'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Alert, Button, Modal, Spin, Typography } from 'antd';

const { Text, Paragraph } = Typography;

interface QrScannerModalProps {
  open: boolean;
  onClose: () => void;
  onScan: (qrToken: string) => void;
  demoTokens?: Record<string, string>;
}

export function QrScannerModal({ open, onClose, onScan, demoTokens = {} }: QrScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraState, setCameraState] = useState<
    'initializing' | 'active' | 'denied' | 'unsupported' | 'error'
  >('initializing');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Stop camera stream cleanly
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const handleClose = () => {
    stopCamera();
    setCameraState('initializing');
    setErrorMessage(null);
    onClose();
  };

  useEffect(() => {
    if (!open) {
      stopCamera();
      return;
    }

    let isCancelled = false;

    const initCamera = async () => {
      // Yield to next microtask so state updates occur asynchronously
      await Promise.resolve();
      if (isCancelled) return;

      if (
        typeof navigator === 'undefined' ||
        !navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia
      ) {
        setCameraState('unsupported');
        setErrorMessage(
          'Camera access is not supported by your browser or environment. Please use manual code entry.',
        );
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        });

        if (isCancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
        setCameraState('active');
      } catch (err: unknown) {
        if (isCancelled) return;
        const domErr = err as DOMException | Error;
        if (domErr.name === 'NotAllowedError' || domErr.name === 'PermissionDeniedError') {
          setCameraState('denied');
          setErrorMessage(
            'Camera permission was denied. Please allow camera access in your browser settings or use manual code entry.',
          );
        } else if (domErr.name === 'NotFoundError' || domErr.name === 'DevicesNotFoundError') {
          setCameraState('unsupported');
          setErrorMessage(
            'No camera device was detected on your device. Please use manual room code entry.',
          );
        } else {
          setCameraState('error');
          setErrorMessage(
            `Unable to access camera: ${domErr.message || 'Unknown error'}. Please use manual entry.`,
          );
        }
      }
    };

    void initCamera();

    return () => {
      isCancelled = true;
      stopCamera();
    };
  }, [open]);

  const handleSimulateScan = (token: string) => {
    stopCamera();
    onScan(token);
    onClose();
  };

  return (
    <Modal
      open={open}
      onCancel={handleClose}
      footer={null}
      title="Scan Room QR Code"
      centered
      destroyOnClose
      width={420}
    >
      <div className="flex flex-col items-center py-2">
        {cameraState === 'initializing' && (
          <div className="flex flex-col items-center justify-center py-12">
            <Spin size="large" />
            <Text className="mt-4 text-slate-600">Accessing camera...</Text>
          </div>
        )}

        {cameraState === 'active' && (
          <div className="relative w-full aspect-square max-w-[320px] bg-black rounded-xl overflow-hidden shadow-inner flex items-center justify-center">
            <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
            {/* Viewfinder overlay */}
            <div className="absolute inset-8 border-2 border-yellow-400 rounded-lg pointer-events-none flex flex-col justify-between p-2">
              <div className="w-full flex justify-between">
                <span className="w-4 h-4 border-t-2 border-l-2 border-yellow-400" />
                <span className="w-4 h-4 border-t-2 border-r-2 border-yellow-400" />
              </div>
              {/* Scanning laser line animation */}
              <div className="w-full h-0.5 bg-yellow-400/80 shadow-[0_0_8px_rgba(250,204,21,0.8)] animate-pulse" />
              <div className="w-full flex justify-between">
                <span className="w-4 h-4 border-b-2 border-l-2 border-yellow-400" />
                <span className="w-4 h-4 border-b-2 border-r-2 border-yellow-400" />
              </div>
            </div>
            <div className="absolute bottom-2 text-xs text-white/90 bg-black/60 px-3 py-1 rounded-full">
              Align desk QR code inside frame
            </div>
          </div>
        )}

        {(cameraState === 'denied' || cameraState === 'unsupported' || cameraState === 'error') && (
          <div className="w-full my-2">
            <Alert
              type={cameraState === 'denied' ? 'warning' : 'info'}
              showIcon
              message={
                cameraState === 'denied' ? 'Camera Permission Required' : 'Camera Unavailable'
              }
              description={
                <div className="space-y-2 mt-1">
                  <Paragraph className="!mb-1 text-sm">{errorMessage}</Paragraph>
                  <Text type="secondary" className="text-xs block">
                    You can enter your room code manually from your keycard folder or registration
                    card.
                  </Text>
                </div>
              }
            />
          </div>
        )}

        {/* Developer / Demo Simulator Section */}
        <div className="w-full mt-4 pt-3 border-t border-slate-100">
          <Text className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-2 text-center">
            Demo QR Simulator
          </Text>
          <div className="grid grid-cols-2 gap-2">
            <Button
              size="small"
              onClick={() => {
                const token =
                  demoTokens['101-checked-in'] || demoTokens['Room 101'] || 'demo-room-101-token';
                handleSimulateScan(token);
              }}
              className="text-xs"
            >
              Scan Room 101
            </Button>
            <Button
              size="small"
              onClick={() => {
                const token =
                  demoTokens['102-reserved'] || demoTokens['Room 102'] || 'demo-room-102-token';
                handleSimulateScan(token);
              }}
              className="text-xs"
            >
              Scan Room 102
            </Button>
            <Button
              size="small"
              danger
              onClick={() => {
                const token = demoTokens['105-expired-window'] || 'expired-test-token';
                handleSimulateScan(token);
              }}
              className="text-xs col-span-2"
            >
              Scan Expired Stay QR
            </Button>
          </div>
        </div>

        <Button onClick={handleClose} className="mt-4 w-full">
          Close Scanner
        </Button>
      </div>
    </Modal>
  );
}
