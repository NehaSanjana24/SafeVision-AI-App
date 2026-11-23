import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../../context/AuthContext';
import { ToastProvider } from '../../context/ToastContext';
import { NotificationProvider } from '../../context/NotificationContext';
import { LoginPage } from '../../pages/LoginPage';
import { Sidebar } from '../layout/Sidebar';
import { SettingsPage } from '../../pages/SettingsPage';
import { AlertsPage } from '../../pages/AlertsPage';
import { KPICards } from '../dashboard/KPICards';
import { authService } from '../../services/auth';
import { repository } from '../../services/storage';

const renderWithProviders = (ui: React.ReactElement, initialRoute = '/') => {
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <AuthProvider>
        <ToastProvider>
          <NotificationProvider>{ui}</NotificationProvider>
        </ToastProvider>
      </AuthProvider>
    </MemoryRouter>
  );
};

describe('UI Component & RBAC Integration Tests', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders Sidebar with Intelligence, Safety Reports, Assistant, and Settings links', () => {
    renderWithProviders(<Sidebar collapsed={false} setCollapsed={() => {}} />);
    expect(screen.getByText('Intelligence')).toBeTruthy();
    expect(screen.getByText('Safety Reports')).toBeTruthy();
    expect(screen.getByText('Knowledge Base')).toBeTruthy();
    expect(screen.getByText('Assistant')).toBeTruthy();
    expect(screen.getByText('Settings')).toBeTruthy();
  });

  it('renders KPICards with all 4 safety KPI cards and labels Demo Data vs Live Data accurately', async () => {
    const { rerender } = render(<KPICards isDemoData={true} />);
    await waitFor(() => {
      expect(screen.getByText('Total Inspections')).toBeTruthy();
      expect(screen.getByText('Total PPE Violations')).toBeTruthy();
      expect(screen.getByText('Resolved Violations')).toBeTruthy();
      expect(screen.getByText('Compliance Percentage')).toBeTruthy();
      expect(screen.getByText(/Demo Data/i)).toBeTruthy();
    });

    rerender(
      <KPICards
        data={{
          totalInspections: 42,
          totalViolations: 6,
          resolvedViolations: 4,
          compliancePercentage: 93,
        }}
        isDemoData={false}
      />
    );
    expect(screen.getByText('42')).toBeTruthy();
    expect(screen.getByText('6')).toBeTruthy();
    expect(screen.getByText('4')).toBeTruthy();
    expect(screen.getByText('93%')).toBeTruthy();
    expect(screen.getByText(/Live Backend \/ Stored Data/i)).toBeTruthy();
  });

  it('locks out login after 5 failed authentication attempts', async () => {
    renderWithProviders(<LoginPage />, '/login');

    const emailInput = screen.getByPlaceholderText('admin@safevision.ai');
    const passwordInput = screen.getByPlaceholderText('••••••••');
    const submitBtn = screen.getByRole('button', { name: /Sign In to SafeVision/i });

    fireEvent.change(emailInput, { target: { value: 'admin@safevision.ai' } });
    fireEvent.change(passwordInput, { target: { value: 'wrong-pass' } });

    for (let i = 0; i < 5; i++) {
      fireEvent.click(submitBtn);
      await waitFor(() => {
        expect(screen.getAllByText(/Invalid email or password/i).length).toBeGreaterThan(0);
      });
    }

    fireEvent.click(submitBtn);
    await waitFor(() => {
      expect(screen.getAllByText(/Too many failed attempts/i).length).toBeGreaterThan(0);
    });
  });

  it('enforces RBAC on SettingsPage: hides System Health from Supervisors and allows Admin view', async () => {
    // Log in as Supervisor first
    await authService.login('supervisor@safevision.ai', 'password');
    const { unmount } = renderWithProviders(<SettingsPage />, '/settings');

    await waitFor(() => {
      expect(screen.getByText(/Platform Settings & Governance/i)).toBeTruthy();
    });
    expect(screen.queryByRole('button', { name: /System Health & Telemetry/i })).toBeNull();
    unmount();

    // Log in as Admin
    await authService.login('admin@safevision.ai', 'admin123');
    renderWithProviders(<SettingsPage />, '/settings');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /System Health & Telemetry/i })).toBeTruthy();
    });
  });

  it('filters and searches safety violation records on AlertsPage and resets cleanly', async () => {
    await repository.saveViolation({
      id: 'viol_test_helmet',
      scanId: 'scan_a',
      sourceType: 'image',
      fileName: 'crane_zone_a.jpg',
      type: 'NO-Helmet',
      severity: 'high',
      confidence: 0.92,
      bbox: [0, 0, 50, 50],
      zone: 'A',
      cameraId: 'CAM-01',
      resolved: false,
      createdAt: new Date().toISOString(),
    });
    await repository.saveViolation({
      id: 'viol_test_vest',
      scanId: 'scan_b',
      sourceType: 'video',
      fileName: 'dock_zone_b.mp4',
      type: 'NO-Vest',
      severity: 'medium',
      confidence: 0.85,
      bbox: [0, 0, 50, 50],
      zone: 'B',
      cameraId: 'CAM-02',
      resolved: true,
      createdAt: new Date().toISOString(),
    });

    renderWithProviders(<AlertsPage />, '/alerts');

    await waitFor(() => {
      expect(screen.getByText('crane_zone_a.jpg')).toBeTruthy();
      expect(screen.getByText('dock_zone_b.mp4')).toBeTruthy();
    });

    // Search by camera + zone
    const searchInput = screen.getByLabelText('Search safety violation records');
    fireEvent.change(searchInput, { target: { value: 'CAM-01' } });
    expect(screen.getByText('crane_zone_a.jpg')).toBeTruthy();
    expect(screen.queryByText('dock_zone_b.mp4')).toBeNull();

    // Combine with status filter that matches zero records -> empty state + Reset All Filters
    const statusSelect = screen.getByLabelText('Filter by status');
    fireEvent.change(statusSelect, { target: { value: 'resolved' } });
    expect(screen.getByText(/No safety violations match your active search or filters/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Reset All Filters/i }));
    expect(screen.getByText('crane_zone_a.jpg')).toBeTruthy();
    expect(screen.getByText('dock_zone_b.mp4')).toBeTruthy();
  });
});
