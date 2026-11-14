'use client';

import React, { useState } from 'react';
import { App, Button, Input } from 'antd';

interface ManualEntryFormProps {
  loading: boolean;
  onSubmit: (code: string) => void;
  demoTokens?: Record<string, string>;
}

export function ManualEntryForm({ loading, onSubmit, demoTokens = {} }: ManualEntryFormProps) {
  const { message } = App.useApp();
  const [code, setCode] = useState('');
  const [showDemoChips, setShowDemoChips] = useState(false);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = code.trim();

    if (!trimmed) {
      message.warning('Please enter your room code or QR token.');
      return;
    }

    // Security check: non-negotiable rule "A typed room number alone never authenticates a guest."
    if (/^\d{3,4}$/.test(trimmed)) {
      // Check if it's a known demo room shorthand like "101"
      const matchedDemoKey = Object.keys(demoTokens).find((k) => k.startsWith(trimmed));
      if (matchedDemoKey && demoTokens[matchedDemoKey]) {
        // Resolve demo key to pre-signed token
        onSubmit(demoTokens[matchedDemoKey]);
        return;
      }

      message.error(
        'A room number alone is not authentication. Please enter your full guest access code or scan your desk QR code.',
      );
      return;
    }

    // Direct token or code submission
    onSubmit(trimmed);
  };

  const handleSelectDemo = (tokenKey: string) => {
    const token = demoTokens[tokenKey];
    if (token) {
      setCode(tokenKey);
      onSubmit(token);
    }
  };

  return (
    <div className="w-full">
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 w-full max-w-[340px] mx-auto"
      >
        <Input
          placeholder="Enter room code manually"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          disabled={loading}
          className="flex-1 !bg-[#e8eef4] !border-[#ddd8cf]/90 !text-[#1a1a18] placeholder:!text-[#5a5650] !rounded-[10px] text-xs !h-11"
        />
        <Button
          type="primary"
          htmlType="submit"
          loading={loading}
          className="!bg-[#1a3c5e] hover:!bg-[#12263a] !rounded-[10px] !h-11 px-5 font-semibold text-xs shadow-none"
        >
          Go
        </Button>
      </form>

      {/* Demo shortcuts helper (rendered ONLY in isolated frontend mock mode when demo tokens are present) */}
      {Object.keys(demoTokens).length > 0 && (
        <div className="text-center mt-3">
          <button
            type="button"
            onClick={() => setShowDemoChips(!showDemoChips)}
            className="text-xs text-[#5a5650] hover:text-[#1a1a18] underline focus:outline-none"
          >
            {showDemoChips ? 'Hide demo codes' : 'Quick demo access codes'}
          </button>

          {showDemoChips && (
            <div className="mt-2 flex flex-wrap gap-1.5 justify-center">
              {Object.keys(demoTokens).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleSelectDemo(key)}
                  className="text-[11px] bg-[#e8eef4] hover:bg-slate-200 text-[#1a1a18] px-2 py-1 rounded border border-[#ddd8cf] transition-colors"
                >
                  {key}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
