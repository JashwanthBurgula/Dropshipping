import * as React from "react";
import { redirect } from "next/navigation";
import { getCurrentCustomerSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { createSignedCsrfToken } from "@/lib/csrf";
import { AccountDashboardClient, AccountProfileData } from "@/components/account/AccountDashboardClient";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Your Account",
  description: "Manage your contact details, saved delivery addresses, orders, and security settings.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AccountPage() {
  const session = await getCurrentCustomerSession();
  if (!session) {
    redirect("/login?returnTo=/account");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      fullName: true,
      email: true,
      phone: true,
      addressLine: true,
      city: true,
      state: true,
      pinCode: true,
      latitude: true,
      longitude: true,
      isVerified: true,
      role: true,
      createdAt: true,
      savedAddresses: {
        orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
      },
      orders: {
        orderBy: { createdAt: "desc" },
        take: 15,
        select: {
          orderId: true,
          status: true,
          totalPaise: true,
          paymentMethod: true,
          paymentStatus: true,
          estimatedDelivery: true,
          createdAt: true,
          items: {
            select: {
              productId: true,
              nameAtPurchase: true,
              quantity: true,
              lineTotalPaise: true,
            },
          },
        },
      },
    },
  });

  if (!user) {
    redirect("/login?returnTo=/account");
  }

  const csrfToken = createSignedCsrfToken();

  const profileData: AccountProfileData = {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    addressLine: user.addressLine,
    city: user.city,
    state: user.state,
    pinCode: user.pinCode,
    latitude: user.latitude ? Number(user.latitude) : null,
    longitude: user.longitude ? Number(user.longitude) : null,
    isVerified: user.isVerified,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
    savedAddresses: user.savedAddresses.map((addr) => ({
      id: addr.id,
      label: addr.label,
      recipientName: addr.recipientName,
      phone: addr.phone,
      addressLine: addr.addressLine,
      city: addr.city,
      state: addr.state,
      pinCode: addr.pinCode,
      latitude: addr.latitude ? Number(addr.latitude) : null,
      longitude: addr.longitude ? Number(addr.longitude) : null,
      isDefault: addr.isDefault,
    })),
    orders: user.orders.map((ord) => ({
      orderId: ord.orderId,
      status: ord.status,
      totalPaise: ord.totalPaise,
      paymentMethod: ord.paymentMethod,
      paymentStatus: ord.paymentStatus,
      estimatedDelivery: ord.estimatedDelivery.toISOString(),
      createdAt: ord.createdAt.toISOString(),
      items: ord.items.map((it) => ({
        productId: it.productId,
        productName: it.nameAtPurchase,
        quantity: it.quantity,
        lineTotalPaise: it.lineTotalPaise,
      })),
    })),
  };

  return (
    <AccountDashboardClient
      initialProfile={profileData}
      csrfToken={csrfToken}
    />
  );
}
