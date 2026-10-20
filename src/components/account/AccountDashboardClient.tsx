"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  User,
  MapPin,
  Package,
  Shield,
  FileText,
  Trash2,
  Edit2,
  Plus,
  CheckCircle,
  AlertCircle,
  ExternalLink,
  LogOut,
  Download,
} from "lucide-react";
import { formatInrFromPaise } from "@/lib/cn";
import { CSRF_HEADER_NAME } from "@/lib/csrf";

export interface AccountProfileData {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  addressLine: string;
  city: string;
  state: string;
  pinCode: string;
  latitude: number | null;
  longitude: number | null;
  isVerified: boolean;
  role: string;
  createdAt: string;
  savedAddresses: Array<{
    id: string;
    label: string;
    recipientName: string;
    phone: string;
    addressLine: string;
    city: string;
    state: string;
    pinCode: string;
    latitude: number | null;
    longitude: number | null;
    isDefault: boolean;
  }>;
  orders: Array<{
    orderId: string;
    status: string;
    totalPaise: number;
    paymentMethod: string;
    paymentStatus: string;
    estimatedDelivery: string;
    createdAt: string;
    items: Array<{
      productId: string;
      productName: string;
      quantity: number;
      lineTotalPaise: number;
    }>;
  }>;
}

interface Props {
  initialProfile: AccountProfileData;
  csrfToken: string;
}

export function AccountDashboardClient({ initialProfile, csrfToken }: Props) {
  const router = useRouter();
  const [profile, setProfile] = React.useState<AccountProfileData>(initialProfile);
  const [activeTab, setActiveTab] = React.useState<
    "details" | "addresses" | "orders" | "security" | "privacy"
  >("details");

  // Status banners
  const [successMessage, setSuccessMessage] = React.useState("");
  const [errorMessage, setErrorMessage] = React.useState("");

  // Edit details form state
  const [isEditingDetails, setIsEditingDetails] = React.useState(false);
  const [fullName, setFullName] = React.useState(profile.fullName);
  const [phone, setPhone] = React.useState(profile.phone);
  const [addressLine, setAddressLine] = React.useState(profile.addressLine);
  const [pinCode, setPinCode] = React.useState(profile.pinCode);
  const [city, setCity] = React.useState(profile.city);
  const [state, setState] = React.useState(profile.state);
  const [latitude, setLatitude] = React.useState<number | null>(profile.latitude);
  const [longitude, setLongitude] = React.useState<number | null>(profile.longitude);
  const [detailsSaving, setDetailsSaving] = React.useState(false);
  const [detailsErrors, setDetailsErrors] = React.useState<Record<string, string>>({});

  // Address modal state
  const [isAddressModalOpen, setIsAddressModalOpen] = React.useState(false);
  const [editingAddressId, setEditingAddressId] = React.useState<string | null>(null);
  const [addrLabel, setAddrLabel] = React.useState("Home");
  const [addrRecipient, setAddrRecipient] = React.useState("");
  const [addrPhone, setAddrPhone] = React.useState("");
  const [addrLine, setAddrLine] = React.useState("");
  const [addrCity, setAddrCity] = React.useState("");
  const [addrState, setAddrState] = React.useState("");
  const [addrPin, setAddrPin] = React.useState("");
  const [addrDefault, setAddrDefault] = React.useState(false);
  const [addrSaving, setAddrSaving] = React.useState(false);
  const [addrErrors, setAddrErrors] = React.useState<Record<string, string>>({});

  // Password change state
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [passwordSaving, setPasswordSaving] = React.useState(false);
  const [passwordErrors, setPasswordErrors] = React.useState<Record<string, string>>({});

  // Account deletion state
  const [deletePassword, setDeletePassword] = React.useState("");
  const [isDeleteModalOpen, setIsDeleteModalOpen] = React.useState(false);
  const [deleteSaving, setDeleteSaving] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState("");

  // Initials avatar
  const initials = profile.fullName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("") || "U";

  const memberSince = new Date(profile.createdAt).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });

  const clearMessages = () => {
    setSuccessMessage("");
    setErrorMessage("");
  };

  // Live PIN Code Serviceability lookup on address edit
  const handlePinLookup = async (enteredPin: string, isForSavedAddr = false) => {
    if (!/^\d{6}$/.test(enteredPin)) return;
    try {
      const res = await fetch(`/api/pin-codes/${enteredPin}`);
      const data = (await res.json()) as {
        ok?: boolean;
        pinCode?: { city: string; state: string; codAvailable: boolean };
      };
      if (res.ok && data.pinCode) {
        if (isForSavedAddr) {
          setAddrCity(data.pinCode.city);
          setAddrState(data.pinCode.state);
        } else {
          setCity(data.pinCode.city);
          setState(data.pinCode.state);
        }
      }
    } catch {
      // Ignore network errors on lookup
    }
  };

  const handleSaveDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    setDetailsSaving(true);
    setDetailsErrors({});

    try {
      const res = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          [CSRF_HEADER_NAME]: csrfToken,
        },
        body: JSON.stringify({
          fullName,
          phone,
          addressLine,
          city,
          state,
          pinCode,
          latitude,
          longitude,
        }),
      });

      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        fieldErrors?: Record<string, string>;
        profile?: AccountProfileData;
      };

      if (!res.ok || !data.ok) {
        setErrorMessage(data.error ?? "Failed to update profile details.");
        if (data.fieldErrors) setDetailsErrors(data.fieldErrors);
        setDetailsSaving(false);
        return;
      }

      setProfile((prev) => ({
        ...prev,
        fullName,
        phone,
        addressLine,
        city,
        state,
        pinCode,
        latitude,
        longitude,
      }));
      setSuccessMessage("Your profile and delivery details have been updated.");
      setIsEditingDetails(false);
    } catch {
      setErrorMessage("Network error while updating details.");
    } finally {
      setDetailsSaving(false);
    }
  };

  const handleOpenAddressModal = (addr?: AccountProfileData["savedAddresses"][number]) => {
    if (addr) {
      setEditingAddressId(addr.id);
      setAddrLabel(addr.label);
      setAddrRecipient(addr.recipientName);
      setAddrPhone(addr.phone);
      setAddrLine(addr.addressLine);
      setAddrCity(addr.city);
      setAddrState(addr.state);
      setAddrPin(addr.pinCode);
      setAddrDefault(addr.isDefault);
    } else {
      setEditingAddressId(null);
      setAddrLabel("Home");
      setAddrRecipient(profile.fullName);
      setAddrPhone(profile.phone);
      setAddrLine("");
      setAddrCity(profile.city);
      setAddrState(profile.state);
      setAddrPin(profile.pinCode);
      setAddrDefault(profile.savedAddresses.length === 0);
    }
    setAddrErrors({});
    setIsAddressModalOpen(true);
  };

  const handleSaveAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    setAddrSaving(true);
    setAddrErrors({});

    const endpoint = editingAddressId
      ? `/api/account/addresses/${editingAddressId}`
      : "/api/account/addresses";
    const method = editingAddressId ? "PATCH" : "POST";

    try {
      const res = await fetch(endpoint, {
        method,
        headers: {
          "Content-Type": "application/json",
          [CSRF_HEADER_NAME]: csrfToken,
        },
        body: JSON.stringify({
          label: addrLabel,
          recipientName: addrRecipient,
          phone: addrPhone,
          addressLine: addrLine,
          city: addrCity,
          state: addrState,
          pinCode: addrPin,
          isDefault: addrDefault,
        }),
      });

      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        fieldErrors?: Record<string, string>;
      };

      if (!res.ok || !data.ok) {
        setErrorMessage(data.error ?? "Failed to save address.");
        if (data.fieldErrors) setAddrErrors(data.fieldErrors);
        setAddrSaving(false);
        return;
      }

      // Refresh addresses
      const refreshRes = await fetch("/api/account/addresses");
      const refreshData = (await refreshRes.json()) as {
        ok?: boolean;
        addresses?: AccountProfileData["savedAddresses"];
      };
      if (refreshData.addresses) {
        setProfile((prev) => ({ ...prev, savedAddresses: refreshData.addresses! }));
      }

      setSuccessMessage(
        editingAddressId
          ? "Saved address updated successfully."
          : "New delivery address added successfully."
      );
      setIsAddressModalOpen(false);
    } catch {
      setErrorMessage("Network error while saving address.");
    } finally {
      setAddrSaving(false);
    }
  };

  const handleDeleteAddress = async (addressId: string) => {
    if (!confirm("Are you sure you want to remove this saved address?")) return;
    clearMessages();

    try {
      const res = await fetch(`/api/account/addresses/${addressId}`, {
        method: "DELETE",
        headers: {
          [CSRF_HEADER_NAME]: csrfToken,
        },
      });

      if (!res.ok) {
        setErrorMessage("Failed to delete address.");
        return;
      }

      setProfile((prev) => ({
        ...prev,
        savedAddresses: prev.savedAddresses.filter((a) => a.id !== addressId),
      }));
      setSuccessMessage("Address removed from your saved addresses.");
    } catch {
      setErrorMessage("Network error while deleting address.");
    }
  };

  const handleSetDefaultAddress = async (addressId: string) => {
    clearMessages();
    try {
      const res = await fetch(`/api/account/addresses/${addressId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          [CSRF_HEADER_NAME]: csrfToken,
        },
        body: JSON.stringify({ isDefault: true }),
      });

      if (!res.ok) {
        setErrorMessage("Failed to update default address.");
        return;
      }

      setProfile((prev) => ({
        ...prev,
        savedAddresses: prev.savedAddresses.map((a) => ({
          ...a,
          isDefault: a.id === addressId,
        })),
      }));
      setSuccessMessage("Default address updated.");
    } catch {
      setErrorMessage("Network error while updating default address.");
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    setPasswordSaving(true);
    setPasswordErrors({});

    try {
      const res = await fetch("/api/account/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [CSRF_HEADER_NAME]: csrfToken,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        fieldErrors?: Record<string, string>;
      };

      if (!res.ok || !data.ok) {
        setErrorMessage(data.error ?? "Failed to change password.");
        if (data.fieldErrors) setPasswordErrors(data.fieldErrors);
        setPasswordSaving(false);
        return;
      }

      setSuccessMessage(
        "Your password has been changed successfully. All other devices have been signed out."
      );
      setCurrentPassword("");
      setNewPassword("");
    } catch {
      setErrorMessage("Network error while changing password.");
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleSignOutAllDevices = async () => {
    if (!confirm("Are you sure you want to sign out of all active devices and browsers?"))
      return;
    clearMessages();

    try {
      const res = await fetch("/api/account/logout-all", {
        method: "POST",
        headers: { [CSRF_HEADER_NAME]: csrfToken },
      });

      if (!res.ok) {
        setErrorMessage("Failed to sign out of all devices.");
        return;
      }

      router.push("/login");
      router.refresh();
    } catch {
      setErrorMessage("Network error during global sign out.");
    }
  };

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeleteSaving(true);
    setDeleteError("");

    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [CSRF_HEADER_NAME]: csrfToken,
        },
        body: JSON.stringify({ password: deletePassword }),
      });

      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setDeleteError(data.error ?? "Incorrect password. Could not delete account.");
        setDeleteSaving(false);
        return;
      }

      router.push("/");
      router.refresh();
    } catch {
      setDeleteError("Network error during account deletion.");
      setDeleteSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F6F7] py-8 sm:py-12">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
        {/* Header Block */}
        <div className="mb-6 rounded-[8px] border border-[#DDE1E6] bg-[#FFFFFF] p-6 sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div
                aria-hidden="true"
                className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[4px] bg-[#0F2742] text-xl font-bold text-[#FFFFFF]"
              >
                {initials}
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-[#101828]">
                  {profile.fullName}
                </h1>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[#475467]">
                  <span>{profile.email}</span>
                  {profile.isVerified ? (
                    <span className="inline-flex items-center gap-1 rounded-[4px] bg-[#DCFCE7] px-2 py-0.5 text-xs font-semibold text-[#15803D]">
                      <CheckCircle className="h-3 w-3" />
                      Verified
                    </span>
                  ) : null}
                  <span>•</span>
                  <span>Member since {memberSince}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleSignOutAllDevices}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[4px] border border-[#DDE1E6] bg-[#FFFFFF] px-4 py-2 text-sm font-medium text-[#101828] hover:bg-[#F5F6F7]"
              >
                <LogOut className="h-4 w-4" />
                Sign out of all devices
              </button>
            </div>
          </div>
        </div>

        {/* Status Alerts */}
        {successMessage ? (
          <div
            role="status"
            className="mb-6 flex items-start gap-2.5 rounded-[8px] border border-[#15803D] bg-[#DCFCE7] p-4 text-sm text-[#15803D]"
          >
            <CheckCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <p className="font-medium">{successMessage}</p>
          </div>
        ) : null}

        {errorMessage ? (
          <div
            role="alert"
            className="mb-6 flex items-start gap-2.5 rounded-[8px] border border-[#B42318] bg-[#FEF2F2] p-4 text-sm text-[#B42318]"
          >
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <p className="font-medium">{errorMessage}</p>
          </div>
        ) : null}

        {/* Navigation Tabs */}
        <div className="mb-6 flex border-b border-[#DDE1E6]">
          <nav className="flex gap-2 overflow-x-auto pb-px" aria-label="Account sections">
            {[
              { id: "details", label: "Personal details", icon: User },
              { id: "addresses", label: "Saved addresses", icon: MapPin },
              { id: "orders", label: "Your orders", icon: Package },
              { id: "security", label: "Security & login", icon: Shield },
              { id: "privacy", label: "Privacy & data rights", icon: FileText },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    clearMessages();
                    setActiveTab(tab.id as typeof activeTab);
                  }}
                  className={`inline-flex min-h-[44px] items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
                    isActive
                      ? "border-[#1D4ED8] text-[#1D4ED8]"
                      : "border-transparent text-[#475467] hover:border-[#DDE1E6] hover:text-[#101828]"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Tab 1: Personal Details */}
        {activeTab === "details" && (
          <div className="rounded-[8px] border border-[#DDE1E6] bg-[#FFFFFF] p-6 sm:p-8">
            <div className="flex items-center justify-between border-b border-[#DDE1E6] pb-4">
              <div>
                <h2 className="text-lg font-bold text-[#101828]">Personal details</h2>
                <p className="mt-1 text-sm text-[#475467]">
                  Manage your contact details and default delivery destination.
                </p>
              </div>
              {!isEditingDetails && (
                <button
                  type="button"
                  onClick={() => setIsEditingDetails(true)}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-[4px] border border-[#DDE1E6] bg-[#FFFFFF] px-4 py-2 text-sm font-medium text-[#101828] hover:bg-[#F5F6F7]"
                >
                  <Edit2 className="h-4 w-4" />
                  Edit details
                </button>
              )}
            </div>

            {!isEditingDetails ? (
              <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div>
                  <span className="text-xs font-semibold uppercase text-[#475467]">
                    Full name
                  </span>
                  <p className="mt-1 text-base font-medium text-[#101828]">
                    {profile.fullName}
                  </p>
                </div>

                <div>
                  <span className="text-xs font-semibold uppercase text-[#475467]">
                    Email address
                  </span>
                  <div className="mt-1 flex items-center gap-2">
                    <p className="text-base font-medium text-[#101828]">
                      {profile.email}
                    </p>
                    <Link
                      href="/verify-email"
                      className="text-xs font-medium text-[#1D4ED8] hover:underline"
                    >
                      Change email
                    </Link>
                  </div>
                </div>

                <div>
                  <span className="text-xs font-semibold uppercase text-[#475467]">
                    Phone number
                  </span>
                  <p className="mt-1 text-base font-medium text-[#101828]">
                    +91 {profile.phone}
                  </p>
                </div>

                <div>
                  <span className="text-xs font-semibold uppercase text-[#475467]">
                    Default delivery PIN code
                  </span>
                  <p className="mt-1 text-base font-medium text-[#101828]">
                    {profile.pinCode} ({profile.city}, {profile.state})
                  </p>
                </div>

                <div className="sm:col-span-2">
                  <span className="text-xs font-semibold uppercase text-[#475467]">
                    Default delivery address
                  </span>
                  <p className="mt-1 text-base text-[#101828]">
                    {profile.addressLine}, {profile.city}, {profile.state} -{" "}
                    {profile.pinCode}
                  </p>
                </div>

                {profile.latitude && profile.longitude ? (
                  <div className="sm:col-span-2 rounded-[4px] bg-[#F5F6F7] p-4 text-sm text-[#475467]">
                    <div className="flex items-center justify-between">
                      <span>
                        GPS location saved: {profile.latitude.toFixed(4)},{" "}
                        {profile.longitude.toFixed(4)}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setLatitude(null);
                          setLongitude(null);
                          void handleSaveDetails({ preventDefault: () => {} } as any);
                        }}
                        className="text-xs font-medium text-[#B42318] hover:underline"
                      >
                        Remove location
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <form onSubmit={handleSaveDetails} className="mt-6 flex flex-col gap-5">
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="acc-fullName"
                      className="block text-sm font-medium text-[#101828]"
                    >
                      Full name
                    </label>
                    <input
                      id="acc-fullName"
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="mt-1 block min-h-[44px] w-full rounded-[4px] border border-[#DDE1E6] bg-[#FFFFFF] px-3.5 py-2 text-base text-[#101828] focus:border-[#1D4ED8] focus:ring-1 focus:ring-[#1D4ED8]"
                    />
                    {detailsErrors.fullName && (
                      <p className="mt-1 text-xs text-[#B42318]">
                        {detailsErrors.fullName}
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="acc-phone"
                      className="block text-sm font-medium text-[#101828]"
                    >
                      Mobile phone (10 digits)
                    </label>
                    <input
                      id="acc-phone"
                      type="tel"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="mt-1 block min-h-[44px] w-full rounded-[4px] border border-[#DDE1E6] bg-[#FFFFFF] px-3.5 py-2 text-base text-[#101828] focus:border-[#1D4ED8] focus:ring-1 focus:ring-[#1D4ED8]"
                    />
                    {detailsErrors.phone && (
                      <p className="mt-1 text-xs text-[#B42318]">
                        {detailsErrors.phone}
                      </p>
                    )}
                  </div>

                  <div className="sm:col-span-2">
                    <label
                      htmlFor="acc-addressLine"
                      className="block text-sm font-medium text-[#101828]"
                    >
                      Street address / flat / house number
                    </label>
                    <input
                      id="acc-addressLine"
                      type="text"
                      required
                      value={addressLine}
                      onChange={(e) => setAddressLine(e.target.value)}
                      className="mt-1 block min-h-[44px] w-full rounded-[4px] border border-[#DDE1E6] bg-[#FFFFFF] px-3.5 py-2 text-base text-[#101828] focus:border-[#1D4ED8] focus:ring-1 focus:ring-[#1D4ED8]"
                    />
                    {detailsErrors.addressLine && (
                      <p className="mt-1 text-xs text-[#B42318]">
                        {detailsErrors.addressLine}
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="acc-pinCode"
                      className="block text-sm font-medium text-[#101828]"
                    >
                      6-digit PIN code
                    </label>
                    <input
                      id="acc-pinCode"
                      type="text"
                      maxLength={6}
                      required
                      value={pinCode}
                      onChange={(e) => {
                        setPinCode(e.target.value);
                        void handlePinLookup(e.target.value);
                      }}
                      className="mt-1 block min-h-[44px] w-full rounded-[4px] border border-[#DDE1E6] bg-[#FFFFFF] px-3.5 py-2 text-base text-[#101828] focus:border-[#1D4ED8] focus:ring-1 focus:ring-[#1D4ED8]"
                    />
                    {detailsErrors.pinCode && (
                      <p className="mt-1 text-xs text-[#B42318]">
                        {detailsErrors.pinCode}
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label
                        htmlFor="acc-city"
                        className="block text-sm font-medium text-[#101828]"
                      >
                        City
                      </label>
                      <input
                        id="acc-city"
                        type="text"
                        required
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        className="mt-1 block min-h-[44px] w-full rounded-[4px] border border-[#DDE1E6] bg-[#FFFFFF] px-3.5 py-2 text-base text-[#101828] focus:border-[#1D4ED8] focus:ring-1 focus:ring-[#1D4ED8]"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="acc-state"
                        className="block text-sm font-medium text-[#101828]"
                      >
                        State
                      </label>
                      <input
                        id="acc-state"
                        type="text"
                        required
                        value={state}
                        onChange={(e) => setState(e.target.value)}
                        className="mt-1 block min-h-[44px] w-full rounded-[4px] border border-[#DDE1E6] bg-[#FFFFFF] px-3.5 py-2 text-base text-[#101828] focus:border-[#1D4ED8] focus:ring-1 focus:ring-[#1D4ED8]"
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-end gap-3 border-t border-[#DDE1E6] pt-4">
                  <button
                    type="button"
                    onClick={() => setIsEditingDetails(false)}
                    className="inline-flex min-h-[44px] items-center rounded-[4px] border border-[#DDE1E6] bg-[#FFFFFF] px-4 py-2 text-sm font-medium text-[#101828] hover:bg-[#F5F6F7]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={detailsSaving}
                    className="inline-flex min-h-[44px] items-center rounded-[4px] bg-[#1D4ED8] px-5 py-2 text-sm font-medium text-[#FFFFFF] hover:bg-[#1E40AF] disabled:opacity-60"
                  >
                    {detailsSaving ? "Saving..." : "Save details"}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* Tab 2: Saved Addresses */}
        {activeTab === "addresses" && (
          <div className="rounded-[8px] border border-[#DDE1E6] bg-[#FFFFFF] p-6 sm:p-8">
            <div className="flex items-center justify-between border-b border-[#DDE1E6] pb-4">
              <div>
                <h2 className="text-lg font-bold text-[#101828]">Saved delivery addresses</h2>
                <p className="mt-1 text-sm text-[#475467]">
                  Manage addresses for faster checkout across serviceable PIN codes.
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleOpenAddressModal()}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-[4px] bg-[#1D4ED8] px-4 py-2 text-sm font-medium text-[#FFFFFF] hover:bg-[#1E40AF]"
              >
                <Plus className="h-4 w-4" />
                Add address
              </button>
            </div>

            {profile.savedAddresses.length === 0 ? (
              <div className="py-12 text-center">
                <MapPin className="mx-auto h-12 w-12 text-[#475467]" />
                <p className="mt-3 text-base font-semibold text-[#101828]">
                  No saved addresses yet
                </p>
                <p className="mt-1 text-sm text-[#475467]">
                  Save home, work, or studio addresses for one-click checkout.
                </p>
                <button
                  type="button"
                  onClick={() => handleOpenAddressModal()}
                  className="mt-4 inline-flex min-h-[44px] items-center rounded-[4px] bg-[#1D4ED8] px-4 py-2 text-sm font-medium text-[#FFFFFF]"
                >
                  Add your first address
                </button>
              </div>
            ) : (
              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {profile.savedAddresses.map((addr) => (
                  <div
                    key={addr.id}
                    className={`flex flex-col justify-between rounded-[8px] border p-5 ${
                      addr.isDefault
                        ? "border-[#1D4ED8] bg-[#1D4ED8]/5"
                        : "border-[#DDE1E6] bg-[#FFFFFF]"
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="inline-flex rounded-[4px] bg-[#F5F6F7] px-2.5 py-1 text-xs font-bold uppercase text-[#101828]">
                          {addr.label}
                        </span>
                        {addr.isDefault ? (
                          <span className="text-xs font-semibold text-[#1D4ED8]">
                            Default
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleSetDefaultAddress(addr.id)}
                            className="text-xs font-medium text-[#475467] hover:text-[#101828]"
                          >
                            Set as default
                          </button>
                        )}
                      </div>

                      <h3 className="mt-3 text-base font-bold text-[#101828]">
                        {addr.recipientName}
                      </h3>
                      <p className="mt-1 text-sm text-[#475467]">{addr.addressLine}</p>
                      <p className="text-sm text-[#475467]">
                        {addr.city}, {addr.state} - {addr.pinCode}
                      </p>
                      <p className="mt-2 text-xs text-[#475467]">Phone: +91 {addr.phone}</p>
                    </div>

                    <div className="mt-5 flex items-center justify-end gap-3 border-t border-[#DDE1E6] pt-3">
                      <button
                        type="button"
                        onClick={() => handleOpenAddressModal(addr)}
                        className="inline-flex min-h-[36px] items-center gap-1 text-xs font-medium text-[#1D4ED8] hover:underline"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteAddress(addr.id)}
                        className="inline-flex min-h-[36px] items-center gap-1 text-xs font-medium text-[#B42318] hover:underline"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Orders */}
        {activeTab === "orders" && (
          <div className="rounded-[8px] border border-[#DDE1E6] bg-[#FFFFFF] p-6 sm:p-8">
            <div className="border-b border-[#DDE1E6] pb-4">
              <h2 className="text-lg font-bold text-[#101828]">Recent orders</h2>
              <p className="mt-1 text-sm text-[#475467]">
                Track order delivery and view GST invoices for past purchases.
              </p>
            </div>

            {profile.orders.length === 0 ? (
              <div className="py-12 text-center">
                <Package className="mx-auto h-12 w-12 text-[#475467]" />
                <p className="mt-3 text-base font-semibold text-[#101828]">
                  No orders placed yet
                </p>
                <p className="mt-1 text-sm text-[#475467]">
                  Browse our handcrafted tableware, brassware, and home goods catalogue.
                </p>
                <Link
                  href="/catalogue"
                  className="mt-4 inline-flex min-h-[44px] items-center rounded-[4px] bg-[#1D4ED8] px-5 py-2 text-sm font-medium text-[#FFFFFF] hover:bg-[#1E40AF]"
                >
                  Start shopping
                </Link>
              </div>
            ) : (
              <div className="mt-6 flex flex-col gap-4">
                {profile.orders.map((order) => (
                  <div
                    key={order.orderId}
                    className="rounded-[8px] border border-[#DDE1E6] bg-[#FFFFFF] p-5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#DDE1E6] pb-3">
                      <div>
                        <span className="text-xs uppercase text-[#475467]">Order ID</span>
                        <p className="font-mono text-sm font-bold text-[#101828]">
                          {order.orderId}
                        </p>
                      </div>
                      <div>
                        <span className="text-xs uppercase text-[#475467]">Date</span>
                        <p className="text-sm text-[#101828]">
                          {new Date(order.createdAt).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </p>
                      </div>
                      <div>
                        <span className="text-xs uppercase text-[#475467]">Total</span>
                        <p className="text-sm font-bold text-[#101828]">
                          {formatInrFromPaise(order.totalPaise)}
                        </p>
                      </div>
                      <div>
                        <span className="text-xs uppercase text-[#475467]">Status</span>
                        <span className="ml-2 inline-flex rounded-[4px] bg-[#F5F6F7] px-2 py-0.5 text-xs font-semibold text-[#101828]">
                          {order.status.replace(/_/g, " ")}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/track?orderId=${encodeURIComponent(order.orderId)}`}
                          className="inline-flex min-h-[36px] items-center gap-1 rounded-[4px] bg-[#1D4ED8] px-3 py-1.5 text-xs font-semibold text-[#FFFFFF] hover:bg-[#1E40AF]"
                        >
                          Track shipment
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                        <Link
                          href={`/orders/${order.orderId}/confirmation`}
                          className="inline-flex min-h-[36px] items-center gap-1 rounded-[4px] border border-[#DDE1E6] bg-[#FFFFFF] px-3 py-1.5 text-xs font-medium text-[#101828] hover:bg-[#F5F6F7]"
                        >
                          Invoice &amp; details
                        </Link>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-col gap-1.5">
                      {order.items.map((item, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between text-sm text-[#475467]"
                        >
                          <span>
                            {item.quantity}x {item.productName}
                          </span>
                          <span className="font-medium text-[#101828]">
                            {formatInrFromPaise(item.lineTotalPaise)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 4: Security & Login */}
        {activeTab === "security" && (
          <div className="rounded-[8px] border border-[#DDE1E6] bg-[#FFFFFF] p-6 sm:p-8">
            <div className="border-b border-[#DDE1E6] pb-4">
              <h2 className="text-lg font-bold text-[#101828]">Security &amp; login</h2>
              <p className="mt-1 text-sm text-[#475467]">
                Manage your password and active sign-in sessions.
              </p>
            </div>

            <form onSubmit={handleChangePassword} className="mt-6 max-w-lg">
              <h3 className="text-base font-semibold text-[#101828]">Change password</h3>
              <p className="mt-1 text-xs text-[#475467]">
                Passwords must be at least 10 characters and contain upper, lower, and
                numbers or symbols.
              </p>

              <div className="mt-4 flex flex-col gap-4">
                <div>
                  <label
                    htmlFor="sec-currentPassword"
                    className="block text-sm font-medium text-[#101828]"
                  >
                    Current password
                  </label>
                  <input
                    id="sec-currentPassword"
                    type="password"
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="mt-1 block min-h-[44px] w-full rounded-[4px] border border-[#DDE1E6] bg-[#FFFFFF] px-3.5 py-2 text-base text-[#101828] focus:border-[#1D4ED8] focus:ring-1 focus:ring-[#1D4ED8]"
                  />
                  {passwordErrors.currentPassword && (
                    <p className="mt-1 text-xs text-[#B42318]">
                      {passwordErrors.currentPassword}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="sec-newPassword"
                    className="block text-sm font-medium text-[#101828]"
                  >
                    New password
                  </label>
                  <input
                    id="sec-newPassword"
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="mt-1 block min-h-[44px] w-full rounded-[4px] border border-[#DDE1E6] bg-[#FFFFFF] px-3.5 py-2 text-base text-[#101828] focus:border-[#1D4ED8] focus:ring-1 focus:ring-[#1D4ED8]"
                  />
                  {passwordErrors.newPassword && (
                    <p className="mt-1 text-xs text-[#B42318]">
                      {passwordErrors.newPassword}
                    </p>
                  )}
                </div>

                <div>
                  <button
                    type="submit"
                    disabled={passwordSaving}
                    className="inline-flex min-h-[44px] items-center rounded-[4px] bg-[#1D4ED8] px-5 py-2 text-sm font-medium text-[#FFFFFF] hover:bg-[#1E40AF] disabled:opacity-60"
                  >
                    {passwordSaving ? "Updating password..." : "Update password"}
                  </button>
                </div>
              </div>
            </form>

            <hr className="my-8 border-[#DDE1E6]" />

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-base font-semibold text-[#101828]">Active sessions</h3>
                <p className="mt-1 text-sm text-[#475467]">
                  Signed in on this browser. You can sign out of all devices at any time.
                </p>
              </div>
              <button
                type="button"
                onClick={handleSignOutAllDevices}
                className="inline-flex min-h-[44px] items-center rounded-[4px] border border-[#B42318] bg-[#FFFFFF] px-4 py-2 text-sm font-medium text-[#B42318] hover:bg-[#FEF2F2]"
              >
                Sign out of all devices
              </button>
            </div>
          </div>
        )}

        {/* Tab 5: Privacy & Data Rights */}
        {activeTab === "privacy" && (
          <div className="rounded-[8px] border border-[#DDE1E6] bg-[#FFFFFF] p-6 sm:p-8">
            <div className="border-b border-[#DDE1E6] pb-4">
              <h2 className="text-lg font-bold text-[#101828]">Privacy &amp; data rights</h2>
              <p className="mt-1 text-sm text-[#475467]">
                Exercise your data rights under our Privacy Policy and Digital Personal Data
                Protection regulations.
              </p>
            </div>

            <div className="mt-6 flex flex-col gap-8">
              {/* Export Data */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-base font-semibold text-[#101828]">
                    Download personal data
                  </h3>
                  <p className="mt-1 text-sm text-[#475467]">
                    Obtain a complete machine-readable JSON copy of your profile, saved
                    addresses, order histories, and consent records.
                  </p>
                </div>
                <a
                  href="/api/account/export-data"
                  download
                  className="inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-[4px] border border-[#DDE1E6] bg-[#FFFFFF] px-4 py-2 text-sm font-medium text-[#101828] hover:bg-[#F5F6F7]"
                >
                  <Download className="h-4 w-4" />
                  Download JSON
                </a>
              </div>

              <hr className="border-[#DDE1E6]" />

              {/* Delete Account */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-base font-semibold text-[#B42318]">
                    Request account erasure
                  </h3>
                  <p className="mt-1 text-sm text-[#475467]">
                    Permanently delete your profile and personal information. Past completed
                    invoices will be anonymized to meet statutory GST audit requirements.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsDeleteModalOpen(true)}
                  className="inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-[4px] bg-[#B42318] px-4 py-2 text-sm font-medium text-[#FFFFFF] hover:bg-[#991B1B]"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete account
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Address Edit / Add Modal */}
      {isAddressModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#101828]/50 p-4">
          <div className="w-full max-w-lg rounded-[8px] border border-[#DDE1E6] bg-[#FFFFFF] p-6 shadow-xl">
            <h3 className="text-lg font-bold text-[#101828]">
              {editingAddressId ? "Edit saved address" : "Add new delivery address"}
            </h3>

            <form onSubmit={handleSaveAddress} className="mt-4 flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="m-label"
                    className="block text-xs font-semibold uppercase text-[#475467]"
                  >
                    Address label
                  </label>
                  <input
                    id="m-label"
                    type="text"
                    required
                    value={addrLabel}
                    onChange={(e) => setAddrLabel(e.target.value)}
                    placeholder="Home / Studio / Office"
                    className="mt-1 block min-h-[44px] w-full rounded-[4px] border border-[#DDE1E6] bg-[#FFFFFF] px-3 text-sm text-[#101828]"
                  />
                </div>
                <div>
                  <label
                    htmlFor="m-recipient"
                    className="block text-xs font-semibold uppercase text-[#475467]"
                  >
                    Recipient name
                  </label>
                  <input
                    id="m-recipient"
                    type="text"
                    required
                    value={addrRecipient}
                    onChange={(e) => setAddrRecipient(e.target.value)}
                    className="mt-1 block min-h-[44px] w-full rounded-[4px] border border-[#DDE1E6] bg-[#FFFFFF] px-3 text-sm text-[#101828]"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="m-phone"
                  className="block text-xs font-semibold uppercase text-[#475467]"
                >
                  Contact phone (10 digits)
                </label>
                <input
                  id="m-phone"
                  type="tel"
                  required
                  value={addrPhone}
                  onChange={(e) => setAddrPhone(e.target.value)}
                  className="mt-1 block min-h-[44px] w-full rounded-[4px] border border-[#DDE1E6] bg-[#FFFFFF] px-3 text-sm text-[#101828]"
                />
              </div>

              <div>
                <label
                  htmlFor="m-line"
                  className="block text-xs font-semibold uppercase text-[#475467]"
                >
                  Street address
                </label>
                <input
                  id="m-line"
                  type="text"
                  required
                  value={addrLine}
                  onChange={(e) => setAddrLine(e.target.value)}
                  className="mt-1 block min-h-[44px] w-full rounded-[4px] border border-[#DDE1E6] bg-[#FFFFFF] px-3 text-sm text-[#101828]"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label
                    htmlFor="m-pin"
                    className="block text-xs font-semibold uppercase text-[#475467]"
                  >
                    PIN code
                  </label>
                  <input
                    id="m-pin"
                    type="text"
                    maxLength={6}
                    required
                    value={addrPin}
                    onChange={(e) => {
                      setAddrPin(e.target.value);
                      void handlePinLookup(e.target.value, true);
                    }}
                    className="mt-1 block min-h-[44px] w-full rounded-[4px] border border-[#DDE1E6] bg-[#FFFFFF] px-3 text-sm text-[#101828]"
                  />
                </div>
                <div>
                  <label
                    htmlFor="m-city"
                    className="block text-xs font-semibold uppercase text-[#475467]"
                  >
                    City
                  </label>
                  <input
                    id="m-city"
                    type="text"
                    required
                    value={addrCity}
                    onChange={(e) => setAddrCity(e.target.value)}
                    className="mt-1 block min-h-[44px] w-full rounded-[4px] border border-[#DDE1E6] bg-[#FFFFFF] px-3 text-sm text-[#101828]"
                  />
                </div>
                <div>
                  <label
                    htmlFor="m-state"
                    className="block text-xs font-semibold uppercase text-[#475467]"
                  >
                    State
                  </label>
                  <input
                    id="m-state"
                    type="text"
                    required
                    value={addrState}
                    onChange={(e) => setAddrState(e.target.value)}
                    className="mt-1 block min-h-[44px] w-full rounded-[4px] border border-[#DDE1E6] bg-[#FFFFFF] px-3 text-sm text-[#101828]"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="m-default"
                  type="checkbox"
                  checked={addrDefault}
                  onChange={(e) => setAddrDefault(e.target.checked)}
                  className="h-4 w-4 rounded border-[#DDE1E6] text-[#1D4ED8]"
                />
                <label htmlFor="m-default" className="text-sm text-[#101828]">
                  Set as default delivery address
                </label>
              </div>

              <div className="mt-4 flex items-center justify-end gap-3 border-t border-[#DDE1E6] pt-4">
                <button
                  type="button"
                  onClick={() => setIsAddressModalOpen(false)}
                  className="inline-flex min-h-[44px] items-center rounded-[4px] border border-[#DDE1E6] bg-[#FFFFFF] px-4 py-2 text-sm font-medium text-[#101828]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addrSaving}
                  className="inline-flex min-h-[44px] items-center rounded-[4px] bg-[#1D4ED8] px-5 py-2 text-sm font-medium text-[#FFFFFF] hover:bg-[#1E40AF]"
                >
                  {addrSaving ? "Saving..." : "Save address"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Account Deletion Confirmation Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#101828]/50 p-4">
          <div className="w-full max-w-md rounded-[8px] border border-[#B42318] bg-[#FFFFFF] p-6 shadow-xl">
            <h3 className="text-lg font-bold text-[#B42318]">Confirm account deletion</h3>
            <p className="mt-2 text-sm text-[#475467]">
              This action is permanent and cannot be undone. Please re-enter your password to
              confirm deletion.
            </p>

            {deleteError && (
              <p className="mt-3 text-xs font-semibold text-[#B42318]">{deleteError}</p>
            )}

            <form onSubmit={handleDeleteAccount} className="mt-4 flex flex-col gap-4">
              <div>
                <label
                  htmlFor="del-pass"
                  className="block text-sm font-medium text-[#101828]"
                >
                  Your account password
                </label>
                <input
                  id="del-pass"
                  type="password"
                  required
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  className="mt-1 block min-h-[44px] w-full rounded-[4px] border border-[#DDE1E6] bg-[#FFFFFF] px-3.5 py-2 text-base text-[#101828]"
                />
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-[#DDE1E6] pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setIsDeleteModalOpen(false);
                    setDeletePassword("");
                    setDeleteError("");
                  }}
                  className="inline-flex min-h-[44px] items-center rounded-[4px] border border-[#DDE1E6] bg-[#FFFFFF] px-4 py-2 text-sm font-medium text-[#101828]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={deleteSaving}
                  className="inline-flex min-h-[44px] items-center rounded-[4px] bg-[#B42318] px-5 py-2 text-sm font-medium text-[#FFFFFF] hover:bg-[#991B1B]"
                >
                  {deleteSaving ? "Deleting..." : "Permanently delete"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
