import { HttpStatus, HttpException } from '@nestjs/common';

export class UpstreamServiceUnavailableException extends HttpException {
  constructor(serviceName: string, detail?: string) {
    super(
      {
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        error: 'Upstream Service Unavailable',
        message: `Upstream service [${serviceName}] is unavailable or unconfigured.${detail ? ` Detail: ${detail}` : ''}`,
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}

export class InvalidContractPayloadException extends HttpException {
  constructor(serviceName: string, reasons: string[]) {
    super(
      {
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        error: 'Invalid Contract Payload',
        message: `Contract validation failed for service [${serviceName}]: ${reasons.join(', ')}`,
      },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

export class ContractVersionMismatchException extends HttpException {
  constructor(expected: string, received: string) {
    super(
      {
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'Contract Version Mismatch',
        message: `Unsupported contract version [${received}]. Expected [${expected}].`,
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}
