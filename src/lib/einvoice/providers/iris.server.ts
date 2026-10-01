import { createCipheriv, createDecipheriv, publicEncrypt, randomBytes, constants } from 'node:crypto';
import type {
  EInvoiceCancelResult,
  EInvoiceConnectionResult,
  EInvoiceGenerateResult,
  EInvoiceGstinResult,
  EInvoiceProvider,
  EInvoiceEnvironment,
} from '@/lib/einvoice/provider.server';

type IrisEnvelope = {
  Status?: number | string;
  Data?: string;
  ErrorDetails?: Array<{ ErrorCode?: string; ErrorMessage?: string }>;
  InfoDtls?: Array<{ InfCd?: string; Desc?: Record<string, unknown> }>;
};

type IrisAuthData = { AuthToken?: string; Sek?: string; TokenExpiry?: string };

interface IrisConfig {
  environment: EInvoiceEnvironment;
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  portalId: string;
  username: string;
  password: string;
  publicKey: string;
  gstin: string;
}

const SANDBOX_BASE_URL = 'https://api.sandbox.core.irisirp.com';

function required(name: string): string {
  return process.env[name]?.trim() ?? '';
}

export function getIrisConfig(environment: EInvoiceEnvironment, gstin: string): IrisConfig | null {
  const prefix = environment === 'production' ? 'IRIS_PRODUCTION' : 'IRIS_SANDBOX';
  const baseUrl = environment === 'sandbox'
    ? (required(`${prefix}_BASE_URL`) || SANDBOX_BASE_URL)
    : required(`${prefix}_BASE_URL`);
  const config: IrisConfig = {
    environment,
    baseUrl: baseUrl.replace(/\/$/, ''),
    clientId: required(`${prefix}_CLIENT_ID`),
    clientSecret: required(`${prefix}_CLIENT_SECRET`),
    portalId: required(`${prefix}_PORTAL_ID`),
    username: required(`${prefix}_USERNAME`),
    password: required(`${prefix}_PASSWORD`),
    publicKey: required(`${prefix}_PUBLIC_KEY`).replace(/\\n/g, '\n'),
    gstin: gstin.trim().toUpperCase(),
  };
  return Object.values(config).every(Boolean) ? config : null;
}

function aesEncrypt(value: unknown, key: Buffer): string {
  const cipher = createCipheriv('aes-256-ecb', key, null);
  cipher.setAutoPadding(true);
  return Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]).toString('base64');
}

function aesDecrypt<T>(value: string, key: Buffer): T {
  const decipher = createDecipheriv('aes-256-ecb', key, null);
  decipher.setAutoPadding(true);
  const decoded = Buffer.concat([decipher.update(Buffer.from(value, 'base64')), decipher.final()]).toString('utf8');
  return JSON.parse(decoded) as T;
}

function rsaEncrypt(value: string, publicKey: string): string {
  return publicEncrypt(
    { key: publicKey, padding: constants.RSA_PKCS1_PADDING },
    Buffer.from(value, 'utf8'),
  ).toString('base64');
}

function errorFromEnvelope(envelope: IrisEnvelope, fallback: string) {
  const first = envelope.ErrorDetails?.[0];
  return {
    errorCode: first?.ErrorCode ?? 'IRIS_REQUEST_FAILED',
    errorMessage: first?.ErrorMessage ?? fallback,
  };
}

async function fetchJson(url: string, init: RequestInit): Promise<{ status: number; body: IrisEnvelope }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    let body: IrisEnvelope = {};
    try { body = text ? JSON.parse(text) as IrisEnvelope : {}; } catch { body = {}; }
    return { status: response.status, body };
  } finally {
    clearTimeout(timeout);
  }
}

export class IrisProvider implements EInvoiceProvider {
  readonly name = 'iris';
  readonly configured = true;
  readonly environment: EInvoiceEnvironment;

  constructor(private readonly config: IrisConfig) {
    this.environment = config.environment;
  }

  private async authenticate(): Promise<{ token: string; sek: Buffer; httpStatus: number }> {
    const appKey = randomBytes(32);
    const encryptedPassword = rsaEncrypt(this.config.password, this.config.publicKey);
    const encryptedAppKey = rsaEncrypt(appKey.toString('base64'), this.config.publicKey);
    const data = Buffer.from(JSON.stringify({
      UserName: this.config.username,
      Password: encryptedPassword,
      AppKey: encryptedAppKey,
      ForceRefreshAccessToken: false,
    })).toString('base64');
    const response = await fetchJson(`${this.config.baseUrl}/eivital/v1.04/auth`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        gstin: this.config.gstin,
      },
      body: JSON.stringify({ Data: data }),
    });
    if (String(response.body.Status) !== '1' || !response.body.Data) {
      const failure = errorFromEnvelope(response.body, 'IRIS authentication failed.');
      throw Object.assign(new Error(failure.errorMessage), { code: failure.errorCode, httpStatus: response.status });
    }
    const auth = aesDecrypt<IrisAuthData>(response.body.Data, appKey);
    if (!auth.AuthToken || !auth.Sek) throw new Error('IRIS returned an incomplete authentication response.');
    return { token: auth.AuthToken, sek: Buffer.from(auth.Sek, 'base64'), httpStatus: response.status };
  }

  private async coreRequest(path: string, method: 'GET' | 'POST', payload?: unknown) {
    const auth = await this.authenticate();
    const response = await fetchJson(`${this.config.baseUrl}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        gstin: this.config.gstin,
        'auth-token': auth.token,
      },
      ...(payload === undefined ? {} : { body: JSON.stringify({ Data: aesEncrypt(payload, auth.sek) }) }),
    });
    const decrypted = response.body.Data ? aesDecrypt<Record<string, unknown>>(response.body.Data, auth.sek) : null;
    return { httpStatus: response.status, envelope: response.body, data: decrypted };
  }

  async testConnection(): Promise<EInvoiceConnectionResult> {
    try {
      const auth = await this.authenticate();
      return { success: true, httpStatus: auth.httpStatus };
    } catch (error) {
      const failure = error as Error & { code?: string; httpStatus?: number };
      return { success: false, httpStatus: failure.httpStatus, errorCode: failure.code, errorMessage: failure.message };
    }
  }

  async validateGstin(gstin: string): Promise<EInvoiceGstinResult> {
    try {
      const result = await this.coreRequest(`/eivital/v1.04/Master/gstin/${encodeURIComponent(gstin)}`, 'GET');
      if (String(result.envelope.Status) !== '1' || !result.data) {
        return { success: false, httpStatus: result.httpStatus, ...errorFromEnvelope(result.envelope, 'GSTIN validation failed.') };
      }
      return { success: true, httpStatus: result.httpStatus, details: result.data, rawResponse: result.envelope };
    } catch (error) {
      return { success: false, errorCode: 'IRIS_REQUEST_ERROR', errorMessage: error instanceof Error ? error.message : 'IRIS request failed.' };
    }
  }

  async generate(payload: Record<string, unknown>, documentKey: string): Promise<EInvoiceGenerateResult> {
    try {
      const result = await this.coreRequest('/eicore/v1.03/Invoice', 'POST', payload);
      const data = result.data ?? {};
      const duplicate = result.envelope.InfoDtls?.find(info => info.InfCd === 'DUPIRN')?.Desc ?? null;
      const source = String(result.envelope.Status) === '1' ? data : duplicate;
      if (!source) {
        return { success: false, httpStatus: result.httpStatus, rawResponse: result.envelope, ...errorFromEnvelope(result.envelope, 'IRIS rejected the invoice.') };
      }
      return {
        success: true,
        irn: String(source.Irn ?? ''),
        ackNo: String(source.AckNo ?? ''),
        ackDate: String(source.AckDt ?? ''),
        signedQr: String(source.SignedQRCode ?? ''),
        signedInvoice: source.SignedInvoice ? String(source.SignedInvoice) : undefined,
        providerRequestId: String(source.Irn ?? documentKey),
        httpStatus: result.httpStatus,
        rawResponse: result.envelope,
      };
    } catch (error) {
      return { success: false, errorCode: 'IRIS_REQUEST_ERROR', errorMessage: error instanceof Error ? error.message : 'IRIS request failed.' };
    }
  }

  async cancel(args: { irn: string; reasonCode: string; remark: string }): Promise<EInvoiceCancelResult> {
    try {
      const result = await this.coreRequest('/eicore/v1.03/Invoice/Cancel', 'POST', {
        Irn: args.irn,
        CnlRsn: args.reasonCode,
        CnlRem: args.remark,
      });
      if (String(result.envelope.Status) !== '1' || !result.data) {
        return { success: false, httpStatus: result.httpStatus, rawResponse: result.envelope, ...errorFromEnvelope(result.envelope, 'IRIS rejected the cancellation.') };
      }
      return {
        success: true,
        cancelDate: String(result.data.CancelDate ?? ''),
        providerRequestId: String(result.data.Irn ?? args.irn),
        httpStatus: result.httpStatus,
        rawResponse: result.envelope,
      };
    } catch (error) {
      return { success: false, errorCode: 'IRIS_REQUEST_ERROR', errorMessage: error instanceof Error ? error.message : 'IRIS request failed.' };
    }
  }
}