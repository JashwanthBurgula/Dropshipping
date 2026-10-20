export interface SmsMessageRecord {
  id: string;
  toPhone: string;
  body: string;
  tag: "COD_OTP" | "DELIVERY_OTP" | "ORDER_ALERT";
  sentAt: string;
}

export interface SmsProviderAdapter {
  sendSms(params: {
    toPhone: string;
    body: string;
    tag: "COD_OTP" | "DELIVERY_OTP" | "ORDER_ALERT";
  }): Promise<SmsMessageRecord>;
}

const localSmsOutbox: SmsMessageRecord[] = [];

class ConsoleSmsAdapter implements SmsProviderAdapter {
  async sendSms(params: {
    toPhone: string;
    body: string;
    tag: "COD_OTP" | "DELIVERY_OTP" | "ORDER_ALERT";
  }): Promise<SmsMessageRecord> {
    const record: SmsMessageRecord = {
      id: `sms-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      toPhone: params.toPhone,
      body: params.body,
      tag: params.tag,
      sentAt: new Date().toISOString(),
    };
    localSmsOutbox.unshift(record);
    if (localSmsOutbox.length > 200) {
      localSmsOutbox.pop();
    }
    if (process.env.NODE_ENV !== "test") {
      console.info(
        `[SMS:${params.tag}] To +91-${params.toPhone}: ${params.body}`
      );
    }
    return record;
  }
}

const smsAdapter: SmsProviderAdapter = new ConsoleSmsAdapter();

export async function sendCodOtpSms(params: {
  toPhone: string;
  orderId: string;
  otpCode: string;
  amountFormatted: string;
}): Promise<SmsMessageRecord> {
  return smsAdapter.sendSms({
    toPhone: params.toPhone,
    tag: "COD_OTP",
    body: `Kala & Kiln: Your Cash on Delivery verification code for order ${params.orderId} (${params.amountFormatted}) is ${params.otpCode}. Valid for 10 minutes. Do not share this code.`,
  });
}

export function getLocalSmsOutbox(toPhone?: string): SmsMessageRecord[] {
  if (!toPhone) {
    return [...localSmsOutbox];
  }
  const normalized = toPhone.replace(/\D/g, "").slice(-10);
  return localSmsOutbox.filter(
    (msg) => msg.toPhone.replace(/\D/g, "").slice(-10) === normalized
  );
}

export function clearLocalSmsOutboxForTests(): void {
  localSmsOutbox.length = 0;
}
