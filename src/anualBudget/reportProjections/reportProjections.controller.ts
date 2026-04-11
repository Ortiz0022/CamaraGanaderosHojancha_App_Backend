// reportProjections.controller.ts
import { Controller, Get, Header, Query, Res, BadRequestException } from '@nestjs/common';
import type { Response } from 'express';
import { ReportProjectionsService } from './reportProjections.service';
import { Roles } from 'src/auth/roles.decorator';

@Controller('report-proj')
@Roles('ADMIN', 'JUNTA')
export class ReportProjectionsController {
  constructor(private readonly svc: ReportProjectionsService) {}

  // ---------- JSON ----------
  @Get('income')
  compareIncome(
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('departmentId') departmentId?: string,
    @Query('incomeTypeId') incomeTypeId?: string,
    @Query('incomeSubTypeId') incomeSubTypeId?: string,
    @Query('fiscalYearId') fiscalYearId?: string,
  ) {
    return this.svc.compareIncome({
      start, end,
      departmentId: departmentId ? Number(departmentId) : undefined,
      incomeTypeId: incomeTypeId ? Number(incomeTypeId) : undefined,
      incomeSubTypeId: incomeSubTypeId ? Number(incomeSubTypeId) : undefined,
      fiscalYearId: fiscalYearId ? Number(fiscalYearId) : undefined,
    });
  }

  @Get('spend')
  compareSpend(
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('departmentId') departmentId?: string,
    @Query('spendTypeId') spendTypeId?: string,
    @Query('spendSubTypeId') spendSubTypeId?: string,
    @Query('fiscalYearId') fiscalYearId?: string,
  ) {
    return this.svc.compareSpend({
      start, end,
      departmentId: departmentId ? Number(departmentId) : undefined,
      spendTypeId: spendTypeId ? Number(spendTypeId) : undefined,
      spendSubTypeId: spendSubTypeId ? Number(spendSubTypeId) : undefined,
      fiscalYearId: fiscalYearId ? Number(fiscalYearId) : undefined,
    });
  }

  // ---------- PDF COMPARATIVOS ----------
  @Get('income/pdf')
  @Header('Content-Type', 'application/pdf')
  async incomeComparePdf(
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('departmentId') departmentId?: string,
    @Query('incomeTypeId') incomeTypeId?: string,
    @Query('incomeSubTypeId') incomeSubTypeId?: string,
    @Query('fiscalYearId') fiscalYearId?: string,
    @Query('preview') preview?: string,
    @Res() res?: Response,
  ) {
    try {
      const filters = {
        start, end,
        departmentId: departmentId ? Number(departmentId) : undefined,
        incomeTypeId: incomeTypeId ? Number(incomeTypeId) : undefined,
        incomeSubTypeId: incomeSubTypeId ? Number(incomeSubTypeId) : undefined,
        fiscalYearId: fiscalYearId ? Number(fiscalYearId) : undefined,
      };
      const pdf = await this.svc.generateCompareIncomePDF(filters);
      const filename = `reporte-comparativo-ingresos-${new Date().toISOString().slice(0,10)}.pdf`;
      res?.set({
        'Content-Disposition': preview === 'true'
          ? `inline; filename="${filename}"`
          : `attachment; filename="${filename}"`,
        'Content-Length': pdf.length,
        'Cache-Control': 'no-store',
      });
      return res?.send(pdf);
    } catch {
      throw new BadRequestException('No se pudo generar el PDF de ingresos');
    }
  }

  @Get('spend/pdf')
  @Header('Content-Type', 'application/pdf')
  async spendComparePdf(
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('departmentId') departmentId?: string,
    @Query('spendTypeId') spendTypeId?: string,
    @Query('spendSubTypeId') spendSubTypeId?: string,
    @Query('fiscalYearId') fiscalYearId?: string,
    @Query('preview') preview?: string,
    @Res() res?: Response,
  ) {
    try {
      const filters = {
        start, end,
        departmentId: departmentId ? Number(departmentId) : undefined,
        spendTypeId: spendTypeId ? Number(spendTypeId) : undefined,
        spendSubTypeId: spendSubTypeId ? Number(spendSubTypeId) : undefined,
        fiscalYearId: fiscalYearId ? Number(fiscalYearId) : undefined,
      };
      const pdf = await this.svc.generateCompareSpendPDF(filters);
      const filename = `reporte-comparativo-egresos-${new Date().toISOString().slice(0,10)}.pdf`;
      res?.set({
        'Content-Disposition': preview === 'true'
          ? `inline; filename="${filename}"`
          : `attachment; filename="${filename}"`,
        'Content-Length': pdf.length,
        'Cache-Control': 'no-store',
      });
      return res?.send(pdf);
    } catch {
      throw new BadRequestException('No se pudo generar el PDF de egresos');
    }
  }

  // ---------- PDF LISTAS ----------
  @Get('pincome/pdf')
  @Header('Content-Type', 'application/pdf')
  async pIncomePdf(
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('departmentId') departmentId?: string,
    @Query('incomeTypeId') incomeTypeId?: string,
    @Query('incomeSubTypeId') incomeSubTypeId?: string,
    @Query('fiscalYearId') fiscalYearId?: string,
    @Query('preview') preview?: string,
    @Res() res?: Response,
  ) {
    try {
      const filters = {
        start, end,
        departmentId: departmentId ? Number(departmentId) : undefined,
        incomeTypeId: incomeTypeId ? Number(incomeTypeId) : undefined,
        incomeSubTypeId: incomeSubTypeId ? Number(incomeSubTypeId) : undefined,
        fiscalYearId: fiscalYearId ? Number(fiscalYearId) : undefined,
      };
      const pdf = await this.svc.generatePIncomePDF(filters);
      const filename = `reporte-pincome-${new Date().toISOString().slice(0,10)}.pdf`;
      res?.set({
        'Content-Disposition': preview === 'true'
          ? `inline; filename="${filename}"`
          : `attachment; filename="${filename}"`,
        'Content-Length': pdf.length,
        'Cache-Control': 'no-store',
      });
      return res?.send(pdf);
    } catch {
      throw new BadRequestException('No se pudo generar el PDF de pIncome');
    }
  }

  @Get('pspend/pdf')
  @Header('Content-Type', 'application/pdf')
  async pSpendPdf(
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('departmentId') departmentId?: string,
    @Query('spendTypeId') spendTypeId?: string,
    @Query('spendSubTypeId') spendSubTypeId?: string,
    @Query('fiscalYearId') fiscalYearId?: string,
    @Query('preview') preview?: string,
    @Res() res?: Response,
  ) {
    try {
      const filters = {
        start, end,
        departmentId: departmentId ? Number(departmentId) : undefined,
        spendTypeId: spendTypeId ? Number(spendTypeId) : undefined,
        spendSubTypeId: spendSubTypeId ? Number(spendSubTypeId) : undefined,
        fiscalYearId: fiscalYearId ? Number(fiscalYearId) : undefined,
      };
      const pdf = await this.svc.generatePSpendPDF(filters);
      const filename = `reporte-pspend-${new Date().toISOString().slice(0,10)}.pdf`;
      res?.set({
        'Content-Disposition': preview === 'true'
          ? `inline; filename="${filename}"`
          : `attachment; filename="${filename}"`,
        'Content-Length': pdf.length,
        'Cache-Control': 'no-store',
      });
      return res?.send(pdf);
    } catch {
      throw new BadRequestException('No se pudo generar el PDF de pSpend');
    }
  }

  // ---------- EXCEL COMPARATIVOS ----------
  @Get('income/excel')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  async incomeCompareExcel(
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('departmentId') departmentId?: string,
    @Query('incomeTypeId') incomeTypeId?: string,
    @Query('incomeSubTypeId') incomeSubTypeId?: string,
    @Query('fiscalYearId') fiscalYearId?: string,
    @Res() res?: Response,
  ) {
    try {
      const filters = {
        start, end,
        departmentId: departmentId ? Number(departmentId) : undefined,
        incomeTypeId: incomeTypeId ? Number(incomeTypeId) : undefined,
        incomeSubTypeId: incomeSubTypeId ? Number(incomeSubTypeId) : undefined,
        fiscalYearId: fiscalYearId ? Number(fiscalYearId) : undefined,
      };
      const excel = await this.svc.generateCompareIncomeExcel(filters);
      const filename = `reporte-comparativo-ingresos-${new Date().toISOString().slice(0,10)}.xlsx`;
      res?.set({
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': excel.length,
        'Cache-Control': 'no-store',
      });
      return res?.send(excel);
    } catch {
      throw new BadRequestException('No se pudo generar el Excel de ingresos');
    }
  }

  @Get('spend/excel')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  async spendCompareExcel(
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('departmentId') departmentId?: string,
    @Query('spendTypeId') spendTypeId?: string,
    @Query('spendSubTypeId') spendSubTypeId?: string,
    @Query('fiscalYearId') fiscalYearId?: string,
    @Res() res?: Response,
  ) {
    try {
      const filters = {
        start, end,
        departmentId: departmentId ? Number(departmentId) : undefined,
        spendTypeId: spendTypeId ? Number(spendTypeId) : undefined,
        spendSubTypeId: spendSubTypeId ? Number(spendSubTypeId) : undefined,
        fiscalYearId: fiscalYearId ? Number(fiscalYearId) : undefined,
      };
      const excel = await this.svc.generateCompareSpendExcel(filters);
      const filename = `reporte-comparativo-egresos-${new Date().toISOString().slice(0,10)}.xlsx`;
      res?.set({
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': excel.length,
        'Cache-Control': 'no-store',
      });
      return res?.send(excel);
    } catch {
      throw new BadRequestException('No se pudo generar el Excel de egresos');
    }
  }

  // ---------- EXCEL LISTAS ----------
  @Get('pincome/excel')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  async pIncomeExcel(
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('departmentId') departmentId?: string,
    @Query('incomeTypeId') incomeTypeId?: string,
    @Query('incomeSubTypeId') incomeSubTypeId?: string,
    @Query('fiscalYearId') fiscalYearId?: string,
    @Res() res?: Response,
  ) {
    try {
      const filters = {
        start, end,
        departmentId: departmentId ? Number(departmentId) : undefined,
        incomeTypeId: incomeTypeId ? Number(incomeTypeId) : undefined,
        incomeSubTypeId: incomeSubTypeId ? Number(incomeSubTypeId) : undefined,
        fiscalYearId: fiscalYearId ? Number(fiscalYearId) : undefined,
      };
      const excel = await this.svc.generatePIncomeExcel(filters);
      const filename = `reporte-pincome-${new Date().toISOString().slice(0,10)}.xlsx`;
      res?.set({
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': excel.length,
        'Cache-Control': 'no-store',
      });
      return res?.send(excel);
    } catch {
      throw new BadRequestException('No se pudo generar el Excel de pIncome');
    }
  }

  @Get('pspend/excel')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  async pSpendExcel(
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('departmentId') departmentId?: string,
    @Query('spendTypeId') spendTypeId?: string,
    @Query('spendSubTypeId') spendSubTypeId?: string,
    @Query('fiscalYearId') fiscalYearId?: string,
    @Res() res?: Response,
  ) {
    try {
      const filters = {
        start, end,
        departmentId: departmentId ? Number(departmentId) : undefined,
        spendTypeId: spendTypeId ? Number(spendTypeId) : undefined,
        spendSubTypeId: spendSubTypeId ? Number(spendSubTypeId) : undefined,
        fiscalYearId: fiscalYearId ? Number(fiscalYearId) : undefined,
      };
      const excel = await this.svc.generatePSpendExcel(filters);
      const filename = `reporte-pspend-${new Date().toISOString().slice(0,10)}.xlsx`;
      res?.set({
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': excel.length,
        'Cache-Control': 'no-store',
      });
      return res?.send(excel);
    } catch {
      throw new BadRequestException('No se pudo generar el Excel de pSpend');
    }
  }
}
