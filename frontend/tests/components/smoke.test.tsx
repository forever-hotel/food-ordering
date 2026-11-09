import React from 'react';
import { render, screen } from '@testing-library/react';
import { AlertNotice } from '../../src/components/feedback/alert-notice';

describe('AlertNotice component', () => {
  it('renders title and message correctly', () => {
    render(<AlertNotice type="info" title="Test Notice" message="This is a test notice" />);
    expect(screen.getByText('Test Notice')).toBeDefined();
    expect(screen.getByText('This is a test notice')).toBeDefined();
  });
});
