import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import PDFDocument from 'pdfkit';
import * as ExcelJS from 'exceljs';

import { Department } from '../department/entities/department.entity';

// ===== INCOME (real) =====
import { Income } from '../income/entities/income.entity';
import { IncomeSubType } from '../incomeSubType/entities/income-sub-type.entity';
import { IncomeType } from '../incomeType/entities/income-type.entity';

// ===== INCOME (projected) =====
import { PIncome } from '../pIncome/entities/pIncome.entity';
import { PIncomeSubType } from '../pIncomeSubType/entities/pincome-sub-type.entity';
import { PIncomeType } from '../pIncomeType/entities/pincome-type.entity';

// ===== SPEND (real) =====
import { Spend } from '../spend/entities/spend.entity';
import { SpendSubType } from '../spendSubType/entities/spend-sub-type.entity';
import { SpendType } from '../spendType/entities/spend-type.entity';

// ===== SPEND (projected) =====
import { PSpend } from '../pSpend/entities/p-spend.entity';
import { PSpendSubType } from '../pSpendSubType/entities/p-spend-sub-type.entity';
import { PSpendType } from '../pSpendType/entities/p-spend-type.entity';
import { LogoHelper } from '../reportUtils/logo-helper';

type BaseFilters = { start?: string; end?: string; departmentId?: number; fiscalYearId?: number; };
type IncomeFilters = BaseFilters & { incomeTypeId?: number; incomeSubTypeId?: number; };
type SpendFilters  = BaseFilters & { spendTypeId?: number; spendSubTypeId?: number; };
type PDFDoc = InstanceType<typeof PDFDocument>; 
@Injectable()
export class ReportProjectionsService {
  private readonly logger = new Logger(ReportProjectionsService.name);

  constructor(
    @InjectRepository(Income) private readonly incomeRepo: Repository<Income>,
    @InjectRepository(Spend) private readonly spendRepo: Repository<Spend>,
    @InjectRepository(IncomeSubType) private readonly iSubTypeRepo: Repository<IncomeSubType>,
    @InjectRepository(IncomeType) private readonly iTypeRepo: Repository<IncomeType>,
    @InjectRepository(SpendSubType) private readonly sSubTypeRepo: Repository<SpendSubType>,
    @InjectRepository(SpendType) private readonly sTypeRepo: Repository<SpendType>,
    @InjectRepository(PIncome) private readonly pIncomeRepo: Repository<PIncome>,
    @InjectRepository(PSpend) private readonly pSpendRepo: Repository<PSpend>,
    @InjectRepository(PIncomeSubType) private readonly pISubTypeRepo: Repository<PIncomeSubType>,
    @InjectRepository(PIncomeType) private readonly pITypeRepo: Repository<PIncomeType>,
    @InjectRepository(PSpendSubType) private readonly pSSubTypeRepo: Repository<PSpendSubType>,
    @InjectRepository(PSpendType) private readonly pSTypeRepo: Repository<PSpendType>,
    @InjectRepository(Department) private readonly deptRepo: Repository<Department>,
  ) {}

  // ============= ESTILO (igual Extraordinario) =============
  private readonly UI = {
    ink: '#33361D',
    gray: '#666',
    line: '#EAEFE0',
    card: {
      total:  { bg:'#F8F9F3', ring:'#EAEFE0', text:'#5B732E', bar:'#5B732E', barSoft:'#CFE0B5' },
      used:   { bg:'#EAEFE0', ring:'#D8E2CC', text:'#556B2F', bar:'#6B8E23', barSoft:'#D6E2B5' },
      remain: { bg:'#FEF6E0', ring:'#F4E7B7', text:'#C19A3D', bar:'#E5C46A', barSoft:'#F2E7C8' },
    }
  };

  // ===== Moneda y fuentes (control de símbolo) =====
  private hasNotoSans = false;
  private moneyPrefix: '₡' | 'CRC' = 'CRC';

  // Registrar fuentes con las rutas indicadas (y fallback silencioso)
  private registerFonts(doc: PDFDoc) {
    try {
      doc.registerFont('NotoSans', __dirname + '/../../../src/fonts/Noto_Sans/NotoSans-Regular.ttf');
      this.hasNotoSans = true;
    } catch { /* ignore */ }
    try {
      doc.registerFont('NotoSansBold', __dirname + '/../../../src/fonts/Noto_Sans/NotoSans-Bold.ttf');
      this.hasNotoSans = true;
    } catch { /* ignore */ }

    this.moneyPrefix = this.hasNotoSans ? '₡' : 'CRC';
    this.fontRegular(doc); // set default
  }

  // helpers de fuente con fallback seguro
  private fontRegular(doc: PDFDoc) {
    try { doc.font('NotoSans'); } catch { try { doc.font('Helvetica'); } catch {} }
  }
  private fontBold(doc: PDFDoc) {
    try { doc.font('NotoSansBold'); } catch { try { doc.font('Helvetica-Bold'); } catch { try { doc.font('Helvetica'); } catch {} } }
  }

  // ===== Helpers =====
  private formatCRC(n: number) {
    const sign = n < 0 ? '-' : '';
    const abs = Math.abs(Number(n ?? 0));
    const fixed = abs.toFixed(2);
    const [int, dec] = fixed.split('.');
    const miles = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `${sign}${this.moneyPrefix} ${miles},${dec}`;
  }

  private parseISO(d?: string) {
    return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : undefined;
  }

  private hasAnyFilter(f?: any) {
    if (!f) return false;
    return Boolean(
      (f.start && String(f.start).trim()) ||
      (f.end && String(f.end).trim()) ||
      f.departmentId || f.incomeTypeId || f.incomeSubTypeId ||
      f.spendTypeId || f.spendSubTypeId
    );
  }

  // ======= BLOQUES VISUALES =======
  private addHeader(doc: PDFDoc, title: string) {
    const logoBuffer = LogoHelper.getLogoSync();

    const left = 50;
    const right = doc.page.width - 50;

    const topY = 32;
    const logoW = 54;
    const logoH = 34;
    const gap = 12;

    let textX = left;

    if (logoBuffer?.length) {
      try {
        doc.image(logoBuffer, left, topY + 2, {
          fit: [logoW, logoH],
          valign: 'center',
        });
        textX = left + logoW + gap;
      } catch (error) {
        console.error('Error dibujando logo en header:', error);
      }
    }

    this.fontBold(doc);
    doc.fontSize(16).fillColor(this.UI.ink).text(`Reportes — ${title}`, textX, topY, {
      align: 'left',
      width: right - textX,
    });

    this.fontRegular(doc);
    doc.fontSize(9).fillColor(this.UI.gray).text(
      `Generado: ${new Date().toLocaleDateString('es-CR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone: 'America/Costa_Rica',
      })} ${new Date().toLocaleTimeString('es-CR', { timeZone: 'America/Costa_Rica' })}`,
      textX,
      topY + 22,
      {
        align: 'left',
        width: right - textX,
      },
    );

    const lineY = topY + 44;
    doc.moveTo(left, lineY).lineTo(right, lineY).strokeColor(this.UI.line).lineWidth(1).stroke();

    doc.y = lineY + 14;
  }

  private addFiltersBlock(doc: PDFDoc, filters?: any) {
    if (!this.hasAnyFilter(filters)) return;

    const y = doc.y, W = doc.page.width - 100, H = 84;

    doc.roundedRect(50, y, W, H, 12).lineWidth(1).strokeColor(this.UI.line).stroke();
    this.fontBold(doc);
    doc.fontSize(11).fillColor(this.UI.ink).text('Filtros', 65, y + 12);
    this.fontRegular(doc);
    doc.fontSize(9).fillColor(this.UI.gray);

    const f = filters as any;
    const start = f.start ?? '—';
    const end   = f.end ?? '—';
    const dep   = f.departmentId ?? '—';
    const type  = (f.incomeTypeId ?? f.spendTypeId) ?? '—';
    const sub   = (f.incomeSubTypeId ?? f.spendSubTypeId) ?? '—';

    doc.text(`Departamento: ${dep}`,      65,          y + 32, { width: W/2 - 30 });
    doc.text(`Tipo: ${type}`,              65 + W/2,    y + 32, { width: W/4 - 30 });
    doc.text(`Subtipo: ${sub}`,            65 + 3*W/4,  y + 32, { width: W/4 - 30 });
    doc.text(`Desde: ${start}`,            65,          y + 52, { width: W/2 - 30 });
    doc.text(`Hasta: ${end}`,              65 + W/2,    y + 52, { width: W/2 - 30 });

    doc.y = y + H + 16;
  }

addSummaryCardsList(
  doc: PDFDoc,
  summary: {
    byDepartment?: Array<{ departmentId: number; departmentName: string; total: number }>;
    byIncomeSubType?: Array<{ incomeSubTypeId: number; incomeSubTypeName: string; total: number }>;
    bySpendSubType?: Array<{ spendSubTypeId: number; spendSubTypeName: string; total: number }>;
    grandTotal: number;
  },
) {
  const GAP = 10;
  const W = (doc.page.width - 100 - GAP * 2) / 3;
  const H = 80;
  const top = doc.y;

  const total = Number(summary?.grandTotal ?? 0);
  const depts = (summary?.byDepartment ?? []) as Array<{
    departmentName: string;
    total: number;
  }>;
  const topDept =
    [...depts].sort((a, b) => (b.total || 0) - (a.total || 0))[0] ?? {
      departmentName: '—',
      total: 0,
    };

  const bySub =
    (summary?.byIncomeSubType ?? summary?.bySpendSubType) ??
    [];
  const topSub =
    [...bySub].sort((a, b) => (b.total || 0) - (a.total || 0))[0] ?? {
      total: 0,
    };
  const topSubName =
    (topSub as any).incomeSubTypeName ??
    (topSub as any).spendSubTypeName ??
    '—';

  const draw = (
    x: number,
    label: string,
    value: string,
    palette: any,
    pct?: number,
    subtitle?: string,
  ) => {
    const prevY = doc.y;
    doc
      .roundedRect(x, top, W, H, 16)
      .lineWidth(1)
      .strokeColor(palette.ring)
      .fillAndStroke(palette.bg);

    this.fontBold(doc);
    doc
      .fontSize(9)
      .fillColor(palette.text)
      .text(label.toUpperCase(), x + 14, top + 10);

    if (subtitle) {
      this.fontRegular(doc);
      doc
        .fontSize(10)
        .fillColor(palette.text)
        .text(subtitle, x + 14, top + 24, {
          width: W - 28,
          lineBreak: false,
        });
    }

    // Valor → ajusta tamaño para 1 línea
    const maxWidth = W - 28;
    const valueY = subtitle ? top + 40 : top + 28;
    let fontSize = 18;

    this.fontBold(doc);
    doc.fontSize(fontSize);

    let textWidth = doc.widthOfString(value);
    while (textWidth > maxWidth && fontSize > 10) {
      fontSize -= 1;
      doc.fontSize(fontSize);
      textWidth = doc.widthOfString(value);
    }

    doc
      .fillColor(palette.text)
      .text(value, x + 14, valueY, {
        width: maxWidth,
        align: 'right',
        lineBreak: false,
      });

  };

  const pctDept =
    total > 0 ? Math.round((Number(topDept.total || 0) / total) * 100) : 0;
  const pctSub =
    total > 0 ? Math.round((Number(topSub.total || 0) / total) * 100) : 0;

  draw(50, 'Total', this.formatCRC(total), this.UI.card.total, 100);
  draw(
    50 + W + GAP,
    'Top Depto',
    this.formatCRC(Number(topDept.total || 0)),
    this.UI.card.used,
    pctDept,
    topDept.departmentName,
  );
  draw(
    50 + 2 * (W + GAP),
    'Top Subtipo',
    this.formatCRC(Number(topSub.total || 0)),
    this.UI.card.remain,
    pctSub,
    topSubName,
  );

  doc.y = top + H + 16;
}


addSummaryCardsCompare(
  doc: PDFDoc,
  totals: { real: number; projected: number; difference: number },
  diffLabel?: string,
) {
  const GAP = 10;
  const W = (doc.page.width - 100 - GAP * 2) / 3;
  const H = 80;
  const top = doc.y;

  const draw = (
    x: number,
    label: string,
    value: number,
    palette: any,
    pct?: number,
  ) => {
    const prevY = doc.y;
    doc
      .roundedRect(x, top, W, H, 16)
      .lineWidth(1)
      .strokeColor(palette.ring)
      .fillAndStroke(palette.bg);

    this.fontBold(doc);
    doc
      .fontSize(9)
      .fillColor(palette.text)
      .text(label.toUpperCase(), x + 14, top + 10);

    const valueText = this.formatCRC(value);
    const maxWidth = W - 28;
    let fontSize = 18;

    this.fontBold(doc);
    doc.fontSize(fontSize);

    let textWidth = doc.widthOfString(valueText);
    while (textWidth > maxWidth && fontSize > 10) {
      fontSize -= 1;
      doc.fontSize(fontSize);
      textWidth = doc.widthOfString(valueText);
    }

    doc
      .fillColor(palette.text)
      .text(valueText, x + 14, top + 28, {
        width: maxWidth,
        align: 'right',
        lineBreak: false,
      });

  };

  const total =
    Math.max(1, (totals.real ?? 0) + (totals.projected ?? 0));

  draw(
    50,
    'Total Real',
    totals.real ?? 0,
    this.UI.card.total
  );
  draw(
    50 + W + GAP,
    'Total Proyectado',
    totals.projected ?? 0,
    this.UI.card.used
  );
  draw(
    50 + 2 * (W + GAP),
    diffLabel ?? 'Diferencia',
    totals.difference ?? 0,
    this.UI.card.remain
  );

  doc.y = top + H + 16;
}


 private addTableGeneric(
  doc: PDFDoc,
  columns: Array<{ key: string; title: string; w: number; map?: (row:any)=>any; align?: 'left'|'right' }>,
  rows: any[]
) {
  this.fontBold(doc);
  doc.fontSize(12).fillColor(this.UI.ink).text('Detalle', 50, doc.y);
  doc.moveDown(0.5);

  const left = 50, right = doc.page.width - 50, avail = right - left;

  const sumW = columns.reduce((s,c)=>s + c.w, 0);
  const cols = sumW === avail
    ? columns
    : columns.map((c, i, arr) => {
        const scaled = Math.floor((c.w * avail) / sumW);
        if (i === arr.length - 1) {
          const acc = arr.slice(0, i).reduce((s, cc) => s + Math.floor((cc.w * avail) / sumW), 0);
          return { ...c, w: avail - acc };
        }
        return { ...c, w: scaled };
      });

  const xs:number[] = []; let acc = left;
  for (const c of cols) { xs.push(acc); acc += c.w; }

  let y = doc.y + 6;

  // Header
  doc.roundedRect(left, y, avail, 28, 12).fillColor('#F9FAFB')
    .strokeColor(this.UI.line).lineWidth(1).fillAndStroke();
  this.fontBold(doc);
  doc.fontSize(9).fillColor(this.UI.gray);
  cols.forEach((c,i) =>
    doc.text(c.title, xs[i] + 10, y + 9, {
      width: c.w - 20,
      align: (c.align ?? 'left'),
    })
  );
  y += 34;

  const bottom = () => doc.page.height - doc.page.margins.bottom - 28;
  const ensure = (rowH=22) => {
    if (y + rowH > bottom()) {
      doc.addPage();
      y = doc.page.margins.top;

      // Header en nueva página
      doc.roundedRect(left, y, avail, 28, 12).fillColor('#F9FAFB')
        .strokeColor(this.UI.line).lineWidth(1).fillAndStroke();
      this.fontBold(doc);
      doc.fontSize(9).fillColor(this.UI.gray);
      cols.forEach((c,i) =>
        doc.text(c.title, xs[i] + 10, y + 9, {
          width: c.w - 20,
          align: (c.align ?? 'left'),
        })
      );
      y += 34;
    }
  };

  if (!rows.length) {
    ensure(40);
    this.fontRegular(doc);
    doc.fontSize(10).fillColor('#EF4444').text('Sin resultados con los filtros aplicados.', left, y + 6);
    doc.y = y + 40; 
    return;
  }

  const paddingY = 6;

  rows.forEach((row, idx) => {
    this.fontRegular(doc);
    doc.fontSize(9).fillColor(this.UI.ink);

    // 1) calcular textos y alturas
    const cellTexts: string[] = [];
    const cellAligns: ('left'|'right')[] = [];
    const cellHeights: number[] = [];

    cols.forEach((c,i) => {
      const raw = c.map ? c.map(row) : (row as any)[c.key];
      const isMoney = (c.align === 'right');
      const txt = isMoney ? this.formatCRC(Number(raw ?? 0)) : String(raw ?? '—');
      const align = (c.align ?? (isMoney ? 'right' : 'left')) as 'left'|'right';

      const h = doc.heightOfString(txt, {
        width: c.w - 20,
        align,
      });

      cellTexts[i] = txt;
      cellAligns[i] = align;
      cellHeights[i] = h;
    });

    const contentHeight = Math.max(...cellHeights, 10);
    const rowHeight = contentHeight + paddingY * 2;

    // 2) paginación
    ensure(rowHeight);

    // 3) fondo
    doc.rect(left, y, avail, rowHeight)
      .fillColor(idx % 2 === 0 ? '#FFFFFF' : '#FAFAFA')
      .fill();

    // 4) texto (multi-línea)
    this.fontRegular(doc);
    doc.fontSize(9).fillColor(this.UI.ink);
    cols.forEach((c,i) => {
      const txt = cellTexts[i];
      const align = cellAligns[i];
      doc.text(txt, xs[i] + 10, y + paddingY, {
        width: c.w - 20,
        align,
      });
    });

    // 5) línea inferior
    y += rowHeight;
    doc.moveTo(left, y).lineTo(right, y).strokeColor(this.UI.line).lineWidth(0.5).stroke();
  });

  doc.y = y + 8;
}


  private addFooter(doc: PDFDoc, caption = 'Sistema de Presupuesto — Reporte') {
    const left = 50;
    const right = doc.page.width - 50;
    const y = doc.page.height - doc.page.margins.bottom - 14;

    doc.moveTo(left, y - 8)
      .lineTo(right, y - 8)
      .strokeColor(this.UI.line)
      .lineWidth(1)
      .stroke();

    this.fontRegular(doc);
    doc.fontSize(8).fillColor(this.UI.gray).text(caption, left, y, {
      width: right - left,
      align: 'center',
    });
  }

  // -------------- INCOME AGG --------------
  private async realIncomeAgg(filters: IncomeFilters) {
    const qb = this.incomeRepo.createQueryBuilder('i')
      .leftJoin('i.incomeSubType', 'st')
      .leftJoin('st.incomeType', 't')
      .leftJoin('t.department', 'd');

    if (filters.start && filters.end) qb.andWhere('i.date BETWEEN :from AND :to', { from: filters.start, to: filters.end });
    else if (filters.start) qb.andWhere('i.date >= :from', { from: filters.start });
    else if (filters.end) qb.andWhere('i.date <= :to', { to: filters.end });

    if (filters.departmentId) qb.andWhere('d.id = :dep', { dep: filters.departmentId });
    if (filters.incomeTypeId) qb.andWhere('t.id = :t', { t: filters.incomeTypeId });
    if (filters.incomeSubTypeId) qb.andWhere('st.id = :st', { st: filters.incomeSubTypeId });

    try {
      return await qb
        .select([
          'st.id AS subTypeId',
          'st.name AS subTypeName',
          'COALESCE(SUM(i.amount),0) AS realTotal',
        ])
        .groupBy('st.id')
        .addGroupBy('st.name')
        .getRawMany<{ subTypeId:number; subTypeName:string; realTotal:string }>();
    } catch (err) {
      this.logger.error(err);
      throw new BadRequestException('Error consultando ingresos reales');
    }
  }

  private async projectedIncomeAgg(filters: IncomeFilters) {
     const qb = this.pIncomeRepo.createQueryBuilder('pi')
    .leftJoin('pi.pIncomeSubType', 'pst')
    .leftJoin('pst.pIncomeType', 'pt')
    .leftJoin('pt.department', 'd');

    // ✅ AGREGAR FILTRADO POR AÑO FISCAL (PROYECCIONES) O FECHA
    if (filters.fiscalYearId) {
      qb.andWhere('pi.fiscalYearId = :fyId', { fyId: filters.fiscalYearId });
    } else {
      const start = this.parseISO(filters.start);
      const end = this.parseISO(filters.end);
      if (start && end) {
        qb.andWhere('pi.date BETWEEN :from AND :to', { from: start, to: end });
      } else if (start) {
        qb.andWhere('pi.date >= :from', { from: start });
      } else if (end) {
        qb.andWhere('pi.date <= :to', { to: end });
      }
    }

    if (filters.departmentId) qb.andWhere('d.id = :dep', { dep: filters.departmentId });
    if (filters.incomeTypeId) qb.andWhere('pt.id = :t', { t: filters.incomeTypeId });
    if (filters.incomeSubTypeId) qb.andWhere('pst.id = :pst', { pst: filters.incomeSubTypeId });


    try {
      return await qb
        .select([
          'pst.id AS subTypeId',
          'pst.name AS subTypeName',
          'COALESCE(SUM(pi.amount),0) AS projTotal',
        ])
        .groupBy('pst.id')
        .addGroupBy('pst.name')
        .getRawMany<{ subTypeId:number; subTypeName:string; projTotal:string }>();
    } catch (err) {
      this.logger.error(err);
      throw new BadRequestException('Error consultando ingresos proyectados');
    }
  }

  async compareIncome(filters: IncomeFilters) {
    const [real, proj] = await Promise.all([
      this.realIncomeAgg(filters),
      this.projectedIncomeAgg(filters),
    ]);

    const map = new Map<string, { id: number; real: number; proj: number }>();

    real.forEach(r => {
      const key = r.subTypeName.trim().toLowerCase();
      map.set(key, { 
        id: r.subTypeId,
        real: Number(r.realTotal || 0), 
        proj: 0 
      });
    });

    proj.forEach(p => {
      const key = p.subTypeName.trim().toLowerCase();
      const prev = map.get(key);
      if (prev) {
        prev.proj = Number(p.projTotal || 0);
      } else {
        map.set(key, { 
          id: p.subTypeId,
          real: 0, 
          proj: Number(p.projTotal || 0) 
        });
      }
    });

    const rows = Array.from(map.entries()).map(([name, v]) => ({
      incomeSubTypeId: v.id,
      name: name.charAt(0).toUpperCase() + name.slice(1),
      real: v.real,
      projected: v.proj,
      // *** clave: diferencia como PROYECTADO - REAL (así lo tenías) ***
      difference: Number((v.proj - v.real).toFixed(2)),
    }));

    const totals = rows.reduce(
      (acc, r) => {
        acc.real += r.real; acc.projected += r.projected; acc.difference += r.difference;
        return acc;
      },
      { real: 0, projected: 0, difference: 0 },
    );

    return { filters, rows, totals };
  }

  // ========================= SPEND =========================
  private async realSpendAgg(filters: SpendFilters) {
    const qb = this.spendRepo.createQueryBuilder('s')
      .leftJoin('s.spendSubType', 'sst')
      .leftJoin('sst.spendType', 'st')
      .leftJoin('st.department', 'd');

    if (filters.start && filters.end) qb.andWhere('s.date BETWEEN :from AND :to', { from: filters.start, to: filters.end });
    else if (filters.start) qb.andWhere('s.date >= :from', { from: filters.start });
    else if (filters.end) qb.andWhere('s.date <= :to', { to: filters.end });

    if (filters.departmentId) qb.andWhere('d.id = :dep', { dep: filters.departmentId });
    if (filters.spendTypeId) qb.andWhere('st.id = :t', { t: filters.spendTypeId });
    if (filters.spendSubTypeId) qb.andWhere('sst.id = :sst', { sst: filters.spendSubTypeId });

    try {
      return await qb
        .select([
          'sst.id AS subTypeId',
          'sst.name AS subTypeName',
          'COALESCE(SUM(s.amount),0) AS realTotal',
        ])
        .groupBy('sst.id')
        .addGroupBy('sst.name')
        .getRawMany<{ subTypeId:number; subTypeName:string; realTotal:string }>();
    } catch (err) {
      this.logger.error(err);
      throw new BadRequestException('Error consultando egresos reales');
    }
  }
private async projectedSpendAgg(filters: SpendFilters) {
  const qb = this.pSpendRepo.createQueryBuilder('ps')
    .leftJoin('ps.subType', 'psst')        // ✅ Usar relación en lugar de join manual
    .leftJoin('psst.type', 'pst')          // ✅ Usar relación en lugar de join manual
    .leftJoin('pst.department', 'd');      // ✅ Usar relación en lugar de join manual

  // ✅ Agregar filtros de fecha / año fiscal
  if (filters.fiscalYearId) {
    qb.andWhere('ps.fiscalYearId = :fyId', { fyId: filters.fiscalYearId });
  } else {
    const start = this.parseISO(filters.start);
    const end = this.parseISO(filters.end);
    if (start && end) {
      qb.andWhere('ps.date BETWEEN :from AND :to', { from: start, to: end });
    } else if (start) {
      qb.andWhere('ps.date >= :from', { from: start });
    } else if (end) {
      qb.andWhere('ps.date <= :to', { to: end });
    }
  }

  if (filters.departmentId) qb.andWhere('d.id = :dep', { dep: filters.departmentId });
  if (filters.spendTypeId) qb.andWhere('pst.id = :t', { t: filters.spendTypeId });
  if (filters.spendSubTypeId) qb.andWhere('psst.id = :psst', { psst: filters.spendSubTypeId });

  return qb
    .select([
      'psst.id AS subTypeId',
      'psst.name AS subTypeName',
      'COALESCE(SUM(ps.amount),0) AS projTotal',
    ])
    .groupBy('psst.id')
    .addGroupBy('psst.name')
    .getRawMany<{ subTypeId:number; subTypeName:string; projTotal:string }>();
}

  async compareSpend(filters: SpendFilters) {
  const [real, proj] = await Promise.all([
    this.realSpendAgg(filters),
    this.projectedSpendAgg(filters),
  ]);

  // 👇 CAMBIO CLAVE: Usar NOMBRE como key en lugar de ID
  const map = new Map<string, { id: number; real: number; proj: number }>();

  // Procesar gastos reales
  real.forEach(r => {
    const key = r.subTypeName.trim().toLowerCase(); // 👈 Normalizar
    map.set(key, { 
      id: r.subTypeId,
      real: Number(r.realTotal || 0), 
      proj: 0 
    });
  });

  // Procesar gastos proyectados
  proj.forEach(p => {
    const key = p.subTypeName.trim().toLowerCase(); // 👈 Normalizar
    const prev = map.get(key);
    if (prev) {
      prev.proj = Number(p.projTotal || 0);
    } else {
      map.set(key, { 
        id: p.subTypeId,
        real: 0, 
        proj: Number(p.projTotal || 0) 
      });
    }
  });

  // Convertir a rows
  const rows = Array.from(map.entries()).map(([name, v]) => ({
    spendSubTypeId: v.id,
    name: name.charAt(0).toUpperCase() + name.slice(1), // Capitalizar
    real: v.real,
    projected: v.proj,
    difference: Number((v.proj - v.real).toFixed(2)),
  }));

  const totals = rows.reduce(
    (acc, r) => {
      acc.real += r.real;
      acc.projected += r.projected;
      acc.difference += r.difference;
      return acc;
    },
    { real: 0, projected: 0, difference: 0 },
  );

  return { filters, rows, totals };
}
  // =================== PINCOME -> PDF ===================
  async generatePIncomePDF(filters: IncomeFilters) {
    const table = await this.getPIncomeTable(filters);
    const summary = await this.getPIncomeSummary(filters);
    await LogoHelper.preloadLogo();

    return this.generateListPDF({
      title: 'Ingresos Proyectados',
      filters, table, summary,
      columns: [
        { key: 'date',          title: 'FECHA',            w: 85 },
        { key: 'department',    title: 'DEPARTAMENTO',     w: 120, map: (r:any)=> r.department.name },
        { key: 'incomeType',    title: 'TIPO',             w: 100, map: (r:any)=> r.incomeType.name },
        { key: 'incomeSubType', title: 'SUBTIPO',          w: 120, map: (r:any)=> r.incomeSubType.name },
        { key: 'amount',        title: 'MONTO PROYECTADO', w: 70,  map: (r:any)=> r.amount, align: 'right' },
      ],
    });
  }

async getPIncomeTable(filters: IncomeFilters) {
  // Usar las RELACIONES del entity, igual que en projectedIncomeAgg
  const qb = this.pIncomeRepo.createQueryBuilder('pi')
    .leftJoin('pi.pIncomeSubType', 'pist')   // relación hacia el subtipo proyectado
    .leftJoin('pist.pIncomeType', 'pit')     // relación hacia el tipo proyectado
    .leftJoin('pit.department', 'd');        // relación hacia departamento

  // Filtros por fecha / año fiscal
  if (filters.fiscalYearId) {
    qb.andWhere('pi.fiscalYearId = :fyId', { fyId: filters.fiscalYearId });
  } else {
    const start = this.parseISO(filters.start);
    const end = this.parseISO(filters.end);
    if (start && end) {
      qb.andWhere('pi.date BETWEEN :from AND :to', { from: start, to: end });
    } else if (start) {
      qb.andWhere('pi.date >= :from', { from: start });
    } else if (end) {
      qb.andWhere('pi.date <= :to', { to: end });
    }
  }

  // Otros filtros
  if (filters.departmentId) {
    qb.andWhere('d.id = :dep', { dep: filters.departmentId });
  }
  if (filters.incomeTypeId) {
    qb.andWhere('pit.id = :t', { t: filters.incomeTypeId });
  }
  if (filters.incomeSubTypeId) {
    qb.andWhere('pist.id = :pst', { pst: filters.incomeSubTypeId });
  }

  const raw = await qb
    .select([
      'pi.id AS id',
      'pi.date AS date',
      'pi.amount AS amount',
      'd.id AS departmentId',
      'd.name AS departmentName',
      'pit.id AS incomeTypeId',
      'pit.name AS incomeTypeName',
      'pist.id AS incomeSubTypeId',
      'pist.name AS incomeSubTypeName',
    ])
    .orderBy('pi.date', 'ASC')
    .addOrderBy('d.name', 'ASC')
    .addOrderBy('pit.name', 'ASC')
    .addOrderBy('pist.name', 'ASC')
    .getRawMany();

  return raw.map((r) => ({
    id: r.id,
    date: r.date,
    amount: Number(r.amount) || 0,
    department: { id: r.departmentId, name: r.departmentName },
    incomeType: { id: r.incomeTypeId, name: r.incomeTypeName },
    incomeSubType: { id: r.incomeSubTypeId, name: r.incomeSubTypeName },
  }));
}


async getPIncomeSummary(filters: IncomeFilters) {
  // Igual que arriba: usar relaciones, no joins manuales
  const qb = this.pIncomeRepo.createQueryBuilder('pi')
    .leftJoin('pi.pIncomeSubType', 'pist')
    .leftJoin('pist.pIncomeType', 'pit')
    .leftJoin('pit.department', 'd');

  if (filters.fiscalYearId) {
    qb.andWhere('pi.fiscalYearId = :fyId', { fyId: filters.fiscalYearId });
  } else {
    const start = this.parseISO(filters.start);
    const end = this.parseISO(filters.end);

    if (start && end) {
      qb.andWhere('pi.date BETWEEN :from AND :to', { from: start, to: end });
    } else if (start) {
      qb.andWhere('pi.date >= :from', { from: start });
    } else if (end) {
      qb.andWhere('pi.date <= :to', { to: end });
    }
  }

  if (filters.departmentId) qb.andWhere('d.id = :dep', { dep: filters.departmentId });
  if (filters.incomeTypeId) qb.andWhere('pit.id = :t', { t: filters.incomeTypeId });
  if (filters.incomeSubTypeId) qb.andWhere('pist.id = :pst', { pst: filters.incomeSubTypeId });

  // Totales por subtipo
  const bySubType = await qb.clone()
    .select([
      'pist.id AS incomeSubTypeId',
      'pist.name AS incomeSubTypeName',
      'COALESCE(SUM(pi.amount),0) AS total',
    ])
    .groupBy('pist.id')
    .addGroupBy('pist.name')
    .getRawMany<any>();

  // Totales por departamento
  const byDepartment = await qb.clone()
    .select([
      'd.id AS departmentId',
      'd.name AS departmentName',
      'COALESCE(SUM(pi.amount),0) AS total',
    ])
    .groupBy('d.id')
    .addGroupBy('d.name')
    .getRawMany<any>();

  // Gran total
  const grand = await qb.clone()
    .select('COALESCE(SUM(pi.amount),0)', 'grand')
    .getRawOne<{ grand: string }>();

  return {
    byIncomeSubType: bySubType.map((x) => ({
      incomeSubTypeId: x.incomeSubTypeId,
      incomeSubTypeName: x.incomeSubTypeName,
      total: Number(x.total || 0),
    })),
    byDepartment: byDepartment.map((x) => ({
      departmentId: x.departmentId,
      departmentName: x.departmentName,
      total: Number(x.total || 0),
    })),
    grandTotal: Number(grand?.grand || 0),
  };
}

  // =================== PSPEND -> PDF ===================
  async generatePSpendPDF(filters: SpendFilters) {
    const table = await this.getPSpendTable(filters);
    const summary = await this.getPSpendSummary(filters);
    await LogoHelper.preloadLogo();

    return this.generateListPDF({
      title: 'Gastos Proyectados',
      filters, table, summary,
      columns: [
        { key: 'date',         title: 'FECHA',            w: 85 },
        { key: 'department',   title: 'DEPARTAMENTO',     w: 120, map: (r:any)=> r.department.name },
        { key: 'spendType',    title: 'TIPO',             w: 100, map: (r:any)=> r.spendType.name },
        { key: 'spendSubType', title: 'SUBTIPO',          w: 120, map: (r:any)=> r.spendSubType.name },
        { key: 'amount',       title: 'MONTO PROYECTADO', w: 70,  map: (r:any)=> r.amount, align: 'right' },
      ],
    });
  }

async getPSpendTable(filters: SpendFilters) {
  const qb = this.pSpendRepo.createQueryBuilder('ps')
    .leftJoin('ps.subType', 'psst')         // ✅ Usar relación
    .leftJoin('psst.type', 'pst')           // ✅ Usar relación
    .leftJoin('pst.department', 'd');       // ✅ Usar relación


  if (filters.fiscalYearId) {
    qb.andWhere('ps.fiscalYearId = :fyId', { fyId: filters.fiscalYearId });
  } else {
    const start = this.parseISO(filters.start);
    const end = this.parseISO(filters.end);
    if (start && end) qb.andWhere('ps.date BETWEEN :from AND :to', { from: start, to: end });
    else if (start) qb.andWhere('ps.date >= :from', { from: start });
    else if (end) qb.andWhere('ps.date <= :to', { to: end });
  }

  if (filters.departmentId) qb.andWhere('d.id = :dep', { dep: filters.departmentId });
  if (filters.spendTypeId) qb.andWhere('pst.id = :t', { t: filters.spendTypeId });
  if (filters.spendSubTypeId) qb.andWhere('psst.id = :psst', { psst: filters.spendSubTypeId });

  const raw = await qb.select([
    'ps.id AS id','ps.date AS date','ps.amount AS amount',
    'd.id AS departmentId','d.name AS departmentName',
    'pst.id AS spendTypeId','pst.name AS spendTypeName',
    'psst.id AS spendSubTypeId','psst.name AS spendSubTypeName',
  ])
  .orderBy('ps.date','ASC').addOrderBy('d.name','ASC').addOrderBy('pst.name','ASC').addOrderBy('psst.name','ASC')
  .getRawMany<any>();

  return raw.map(r => ({
    id: r.id, date: r.date, amount: Number(r.amount||0),
    department: { id: r.departmentId, name: r.departmentName },
    spendType: { id: r.spendTypeId, name: r.spendTypeName },
    spendSubType: { id: r.spendSubTypeId, name: r.spendSubTypeName },
  }));
}

async getPSpendSummary(filters: SpendFilters) {
  const qb = this.pSpendRepo.createQueryBuilder('ps')
    .leftJoin('ps.subType', 'psst')         // ✅ Usar relación
    .leftJoin('psst.type', 'pst')           // ✅ Usar relación
    .leftJoin('pst.department', 'd');       // ✅ Usar relación

  if (filters.fiscalYearId) {
    qb.andWhere('ps.fiscalYearId = :fyId', { fyId: filters.fiscalYearId });
  } else {
    const start = this.parseISO(filters.start);
    const end = this.parseISO(filters.end);
    if (start && end) qb.andWhere('ps.date BETWEEN :from AND :to', { from: start, to: end });
    else if (start) qb.andWhere('ps.date >= :from', { from: start });
    else if (end) qb.andWhere('ps.date <= :to', { to: end });
  }

  if (filters.departmentId) qb.andWhere('d.id = :dep', { dep: filters.departmentId });
  if (filters.spendTypeId) qb.andWhere('pst.id = :t', { t: filters.spendTypeId });
  if (filters.spendSubTypeId) qb.andWhere('psst.id = :psst', { psst: filters.spendSubTypeId });

  const bySubType = await qb.clone()
    .select(['psst.id AS spendSubTypeId','psst.name AS spendSubTypeName','COALESCE(SUM(ps.amount),0) AS total'])
    .groupBy('psst.id').addGroupBy('psst.name').getRawMany<any>();

  const byDepartment = await qb.clone()
    .select(['d.id AS departmentId','d.name AS departmentName','COALESCE(SUM(ps.amount),0) AS total'])
    .groupBy('d.id').addGroupBy('d.name').getRawMany<any>();

  const grand = await qb.clone()
    .select('COALESCE(SUM(ps.amount),0)','grand').getRawOne<{ grand:string }>();

  return {
    bySpendSubType: bySubType.map(x => ({ spendSubTypeId:x.spendSubTypeId, spendSubTypeName:x.spendSubTypeName, total:Number(x.total||0) })),
    byDepartment: byDepartment.map(x => ({ departmentId:x.departmentId, departmentName:x.departmentName, total:Number(x.total||0) })),
    grandTotal: Number(grand?.grand||0),
  };
}
  // =================== COMPARATIVOS -> PDF ===================
  async generateCompareIncomePDF(filters: IncomeFilters) {
    const { rows, totals } = await this.compareIncome(filters);
    await LogoHelper.preloadLogo();

    return this.generateComparePDF({
      title: 'Comparativo de Ingresos',
      filters, rows, totals, nameColTitle: 'SUBTIPO',
      diffLabel: 'DIFERENCIA (REAL-PROY)',
    });
  }

  async generateCompareSpendPDF(filters: SpendFilters) {
    const { rows, totals } = await this.compareSpend(filters);
    await LogoHelper.preloadLogo();

    return this.generateComparePDF({
      title: 'Comparativo de Egresos',
      filters, rows, totals, nameColTitle: 'SUBTIPO',
      diffLabel: 'DIFERENCIA (REAL-PROY)',
    });
  }

  // =================== PDF CORE: LISTAS ===================
  private async generateListPDF(opts: {
    title: string;
    filters?: SpendFilters | IncomeFilters;
    columns: Array<{ key: string; title: string; w: number; map?: (row:any)=>any; align?: 'left'|'right' }>;
    table: any[];
    summary: {
      byIncomeSubType?: Array<{ incomeSubTypeId:number; incomeSubTypeName:string; total:number }>;
      bySpendSubType?: Array<{ spendSubTypeId:number; spendSubTypeName:string; total:number }>;
      byDepartment?: Array<{ departmentId:number; departmentName:string; total:number }>;
      grandTotal: number;
    };
  }): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 40, layout: 'portrait' });
      this.registerFonts(doc);
      const chunks: Buffer[] = [];
      doc.on('data', c => chunks.push(Buffer.from(c)));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      this.addHeader(doc, opts.title);
      if (this.hasAnyFilter(opts.filters)) this.addFiltersBlock(doc, opts.filters);
      this.addSummaryCardsList(doc, {
        byDepartment: opts.summary.byDepartment,
        byIncomeSubType: opts.summary.byIncomeSubType,
        bySpendSubType: opts.summary.bySpendSubType,
        grandTotal: opts.summary.grandTotal,
      });

      this.addTableGeneric(doc, opts.columns, opts.table);
      this.addFooter(doc);
      doc.end();
    });
  }

  // =================== PDF CORE: COMPARATIVOS ===================
  private async generateComparePDF(opts: {
    title: string;
    filters?: SpendFilters | IncomeFilters;
    rows: Array<{ name: string; real: number; projected: number; difference: number }>;
    totals: { real: number; projected: number; difference: number };
    nameColTitle: string;
    diffLabel?: string;
  }): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 40, layout: 'portrait' });
      this.registerFonts(doc);
      const chunks: Buffer[] = [];
      doc.on('data', c => chunks.push(Buffer.from(c)));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      this.addHeader(doc, opts.title);
      if (this.hasAnyFilter(opts.filters)) this.addFiltersBlock(doc, opts.filters);
      this.addSummaryCardsCompare(doc, opts.totals, opts.diffLabel);

      const cols = [
        { key: 'name',       title: opts.nameColTitle, w: 100, align: 'left' as const },
        { key: 'real',       title: 'REAL',            w: 110, align: 'right' as const, map:(r:any)=> r.real },
        { key: 'projected',  title: 'PROYECTADO',      w: 120, align: 'right' as const, map:(r:any)=> r.projected },
        { key: 'difference', title: opts.diffLabel ?? 'DIFERENCIA', w: 140, align: 'right' as const, map:(r:any)=> r.difference },
      ];
      this.addTableGeneric(doc, cols, opts.rows);

      this.addFooter(doc);
      doc.end();
    });
  }

  async generateExcelExample(data: any[]): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Reporte');
  
    // Define tus estilos similares a UI de PDF:
    const headerFill: ExcelJS.Fill = { type: 'pattern', pattern:'solid', fgColor:{ argb: 'FFF8F9F3' } };
    const headerFont: Partial<ExcelJS.Font> = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF5B732E' } };
    const borderAll: ExcelJS.Border = { style: 'thin', color: { argb: 'FFEAEFE0' } };
  
  
    // Configurar encabezados
    sheet.columns = [
      { header: 'FECHA', key: 'date', width: 15 },
      { header: 'DEPARTAMENTO', key: 'department', width: 25 },
      { header: 'TIPO', key: 'type', width: 20 },
      { header: 'SUBTIPO', key: 'subtype', width: 25 },
      { header: 'MONTO', key: 'amount', width: 15, style: { numFmt: '"₡"#,##0.00;[Red]-"₡"#,##0.00' } },
    ];
  
    // Estilo para filas cabecera
    sheet.getRow(1).eachCell((cell) => {
      cell.fill = headerFill;
      cell.font = headerFont;
      cell.border = {
        top: borderAll,
        left: borderAll,
        bottom: borderAll,
        right: borderAll,
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });
  
    // Agregar datos
    data.forEach(item => {
      const typeName = item.type?.name ?? item.incomeType?.name ?? item.spendType?.name ?? '';
      const subtypeName = item.subtype?.name ?? item.incomeSubType?.name ?? item.spendSubType?.name ?? '';
      sheet.addRow({
        date: item.date,
        department: item.department?.name ?? '',
        type: typeName,
        subtype: subtypeName,
        amount: item.amount,
      });
    });
  
    // Opcional: Ajustar estilo a filas
    sheet.eachRow((row, rowNumber) => {
      if(rowNumber === 1) return;
      row.eachCell(cell => {
        cell.border = {
          top: borderAll,
          left: borderAll,
          bottom: borderAll,
          right: borderAll,
        };
        cell.font = { name: 'Arial', size: 10 };
      });
    });
  
    // Guardar en buffer y devolver (normalizar a Node Buffer)
    const out = await workbook.xlsx.writeBuffer();
    const nodeBuf: Buffer = (Buffer.isBuffer(out)
      ? (out as Buffer)
      : Buffer.from(out as ArrayBuffer));
    return nodeBuf;
  }


// ---------- Helper privado para armar el Excel de comparativos ----------
private async generateCompareExcel(opts: {
  sheetName: string;
  nameHeader: string; // ej. 'SUBTIPO'
  rows: Array<{ name: string; real: number; projected: number; difference: number }>;
  totals: { real: number; projected: number; difference: number };
}): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(opts.sheetName || 'Reporte');

  // Estilos (alineados con tu UI del PDF)
  const headerFill: ExcelJS.Fill = { type: 'pattern', pattern:'solid', fgColor:{ argb: 'FFF8F9F3' } };
  const headerFont: Partial<ExcelJS.Font> = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF5B732E' } };
  const borderAll: ExcelJS.Border = { style: 'thin', color: { argb: 'FFEAEFE0' } };
  const moneyFmt = '"₡"#,##0.00;[Red]-"₡"#,##0.00';

  sheet.columns = [
    { header: opts.nameHeader, key: 'name', width: 35 },
    { header: 'REAL',         key: 'real', width: 16, style: { numFmt: moneyFmt } },
    { header: 'PROYECTADO',   key: 'projected', width: 16, style: { numFmt: moneyFmt } },
    { header: 'DIFERENCIA',   key: 'difference', width: 16, style: { numFmt: moneyFmt } },
  ];

  // Estilo fila de cabecera
  sheet.getRow(1).eachCell((cell) => {
    cell.fill = headerFill;
    cell.font = headerFont;
    cell.border = { top: borderAll, left: borderAll, bottom: borderAll, right: borderAll };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  // Datos
  opts.rows.forEach(r => sheet.addRow(r));

  // Línea de totales
  if (opts?.totals) {
    const totalRow = sheet.addRow({
      name: 'TOTALES',
      real: opts.totals.real ?? 0,
      projected: opts.totals.projected ?? 0,
      difference: opts.totals.difference ?? 0,
    });
    // Negrita + borde superior para separar
    totalRow.eachCell((cell, col) => {
      cell.font = { name: 'Arial', bold: true };
      cell.border = { top: { style: 'thin', color: { argb: 'FFCBD5E1' } }, left: borderAll, right: borderAll, bottom: borderAll };
      if (col > 1) cell.numFmt = moneyFmt;
    });
  }

  // Bordes y fuente base para celdas
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    row.eachCell((cell, colNumber) => {
      cell.border = { top: borderAll, left: borderAll, bottom: borderAll, right: borderAll };
      if (!cell.font?.bold) cell.font = { name: 'Arial', size: 10 };
      if (colNumber === 1) cell.alignment = { vertical: 'middle', horizontal: 'left' };
      else cell.alignment = { vertical: 'middle', horizontal: 'right' };
    });
  });

  // Salida como Buffer (Node)
  const out = await workbook.xlsx.writeBuffer();
  return Buffer.isBuffer(out) ? out as Buffer : Buffer.from(out as ArrayBuffer);
}

/* =========================================================
   1) Helper genérico: genera Excel con columnas declaradas
   ========================================================= */
   private async generateExcelWithColumns(opts: {
    sheetName: string;
    columns: Array<{ header: string; key: string; width?: number; money?: boolean }>;
    rows: any[];                     // objetos con keys declaradas en "columns"
  }): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(opts.sheetName || 'Reporte');
  
    const moneyFmt = '"₡"#,##0.00;[Red]-"₡"#,##0.00';
    const headerFill: ExcelJS.Fill = { type: 'pattern', pattern:'solid', fgColor:{ argb: 'FFF8F9F3' } };
    const headerFont: Partial<ExcelJS.Font> = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF5B732E' } };
    const borderAll: ExcelJS.Border = { style: 'thin', color: { argb: 'FFEAEFE0' } };
  
    // columnas con formato opcional de moneda
    sheet.columns = opts.columns.map(c => ({
      header: c.header,
      key: c.key,
      width: c.width ?? 18,
      style: c.money ? { numFmt: moneyFmt } : {},
    }));
  
    // header
    sheet.getRow(1).eachCell((cell) => {
      cell.fill = headerFill;
      cell.font = headerFont;
      cell.border = { top: borderAll, left: borderAll, bottom: borderAll, right: borderAll };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });
  
    // filas
    // (si alguna key no existe en el row, ExcelJS deja la celda vacía – por eso normalizamos antes)
    sheet.addRows(opts.rows);
  
    // bordes + alineación
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      row.eachCell((cell, colNumber) => {
        cell.border = { top: borderAll, left: borderAll, bottom: borderAll, right: borderAll };
        cell.alignment = { vertical: 'middle', horizontal: colNumber === 1 ? 'left' : 'right' };
        if (!cell.font?.bold) cell.font = { name: 'Arial', size: 10 };
      });
    });
  
    const out = await workbook.xlsx.writeBuffer();
    return Buffer.isBuffer(out) ? out as Buffer : Buffer.from(out as ArrayBuffer);
  }
  
  /* =========================================================
     2) Normalizadores: adaptan tus rows a las keys correctas
     ========================================================= */
  
  // Listados de pIncome / pSpend (tabla usada en PDF)
  private normalizePTableRows(rows: any[]): Array<{
    date: string; department: string; type: string; subType: string; amount: number;
  }> {
    return (rows ?? []).map((r: any) => ({
      date: (r.date ?? r.createdAt ?? '').toString().slice(0, 10),
      department:
        r.department?.name ?? r.department ?? r.Department?.name ?? r.Department ?? '',
      type:
        r.type?.name ?? r.incomeType?.name ?? r.spendType?.name ??
        r.type ?? r.incomeType ?? r.spendType ?? '',
      subType:
        r.subType?.name ?? r.incomeSubType?.name ?? r.spendSubType?.name ??
        r.subType ?? r.incomeSubType ?? r.spendSubType ?? '',
      amount: Number(r.amount ?? r.total ?? r.value ?? 0),
    }));
  }
  
  // Comparativos (real vs proyectado)
  private normalizeCompareRows(rows: any[]): Array<{
    name: string; real: number; projected: number; difference: number;
  }> {
    return (rows ?? []).map((r: any) => {
      const real = Number(r.real ?? 0);
      const projected = Number(r.projected ?? 0);
      const difference = Number(r.difference ?? (projected - real));
      return {
        name: r.name ?? r.subType?.name ?? r.label ?? '',
        real, projected, difference,
      };
    });
  }
  
  /* =========================================================
     3) Re-implementaciones que llaman al helper genérico
     ========================================================= */
  
  // ----- pIncome (LISTA) -----
  async generatePIncomeExcel(filters: IncomeFilters): Promise<Buffer> {
    const rowsRaw = await this.getPIncomeTable(filters);
    const rows = this.normalizePTableRows(rowsRaw);
    return this.generateExcelWithColumns({
      sheetName: 'Ingresos Proyectados',
      columns: [
        { header: 'FECHA',       key: 'date',       width: 14 },
        { header: 'DEPARTAMENTO',key: 'department', width: 26 },
        { header: 'TIPO',        key: 'type',       width: 24 },
        { header: 'SUBTIPO',     key: 'subType',    width: 28 },
        { header: 'MONTO',       key: 'amount',     width: 18, money: true },
      ],
      rows,
    });
  }
  
  // ----- pSpend (LISTA) -----
  async generatePSpendExcel(filters: SpendFilters): Promise<Buffer> {
    const rowsRaw = await this.getPSpendTable(filters);
    const rows = this.normalizePTableRows(rowsRaw);
    return this.generateExcelWithColumns({
      sheetName: 'Gastos Proyectados',
      columns: [
        { header: 'FECHA',       key: 'date',       width: 14 },
        { header: 'DEPARTAMENTO',key: 'department', width: 26 },
        { header: 'TIPO',        key: 'type',       width: 24 },
        { header: 'SUBTIPO',     key: 'subType',    width: 28 },
        { header: 'MONTO',       key: 'amount',     width: 18, money: true },
      ],
      rows,
    });
  }
  
  // ----- Comparativo de Ingresos -----
  async generateCompareIncomeExcel(filters: IncomeFilters): Promise<Buffer> {
    const { rows: raw, totals } = await this.compareIncome(filters);
    const rows = this.normalizeCompareRows(raw);
    // (opcional) incluir totales como última fila
    const rowsWithTotals = [
      ...rows,
      { name: 'TOTALES', real: totals.real ?? 0, projected: totals.projected ?? 0, difference: totals.difference ?? 0 },
    ];
    return this.generateExcelWithColumns({
      sheetName: 'Comparativo Ingresos',
      columns: [
        { header: 'SUBTIPO',    key: 'name',       width: 30 },
        { header: 'REAL',       key: 'real',       width: 16, money: true },
        { header: 'PROYECTADO', key: 'projected',  width: 16, money: true },
        { header: 'DIFERENCIA', key: 'difference', width: 16, money: true },
      ],
      rows: rowsWithTotals,
    });
  }
  
  // ----- Comparativo de Egresos -----
  async generateCompareSpendExcel(filters: SpendFilters): Promise<Buffer> {
    const { rows: raw, totals } = await this.compareSpend(filters);
    const rows = this.normalizeCompareRows(raw);
    const rowsWithTotals = [
      ...rows,
      { name: 'TOTALES', real: totals.real ?? 0, projected: totals.projected ?? 0, difference: totals.difference ?? 0 },
    ];
    return this.generateExcelWithColumns({
      sheetName: 'Comparativo Egresos',
      columns: [
        { header: 'SUBTIPO',    key: 'name',       width: 30 },
        { header: 'REAL',       key: 'real',       width: 16, money: true },
        { header: 'PROYECTADO', key: 'projected',  width: 16, money: true },
        { header: 'DIFERENCIA', key: 'difference', width: 16, money: true },
      ],
      rows: rowsWithTotals,
    });
  }
  

}