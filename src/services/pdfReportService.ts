import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Holding } from '../lib/supabase';
import { Transaction } from './transactionService';
import { formatCurrency } from './priceService';

export interface PortfolioSummary {
  totalValue: number;
  totalInvestment: number;
  totalPnL: number;
  pnLPercent: number;
  totalRealizedPnL: number;
  totalUnrealizedPnL: number;
}

export async function generatePortfolioReport(
  holdings: Holding[],
  summary: PortfolioSummary,
  portfolioName: string = 'Portföy'
) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  let yPos = 20;

  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('PORTFÖY RAPORU', pageWidth / 2, yPos, { align: 'center' });

  yPos += 10;
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text(portfolioName, pageWidth / 2, yPos, { align: 'center' });

  yPos += 5;
  doc.setFontSize(10);
  const reportDate = new Date().toLocaleDateString('tr-TR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  doc.text(`Rapor Tarihi: ${reportDate}`, pageWidth / 2, yPos, { align: 'center' });

  yPos += 15;
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('ÖZET', 14, yPos);

  yPos += 10;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');

  const summaryData = [
    ['Toplam Değer:', `${formatCurrency(summary.totalValue)} ₺`],
    ['Toplam Yatırım:', `${formatCurrency(summary.totalInvestment)} ₺`],
    ['Gerçekleşmeyen K/Z:', `${formatCurrency(summary.totalUnrealizedPnL)} ₺`],
    ['Gerçekleşen K/Z:', `${formatCurrency(summary.totalRealizedPnL)} ₺`],
    ['Toplam K/Z:', `${formatCurrency(summary.totalPnL)} ₺ (${summary.pnLPercent >= 0 ? '+' : ''}${summary.pnLPercent.toFixed(2)}%)`],
  ];

  autoTable(doc, {
    startY: yPos,
    head: [],
    body: summaryData,
    theme: 'plain',
    styles: { fontSize: 10 },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 50 },
      1: { cellWidth: 'auto' }
    },
    margin: { left: 14 }
  });

  yPos = (doc as any).lastAutoTable.finalY + 15;

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('VARLIKLARA GÖRE DAĞILIM', 14, yPos);

  yPos += 10;

  const holdingsData = holdings.map(h => {
    const currentValue = h.current_price * h.quantity;
    const investment = h.purchase_price * h.quantity;
    const unrealizedPnL = currentValue - investment;
    const pnlPercent = investment > 0 ? (unrealizedPnL / investment) * 100 : 0;
    const realizedPnL = h.total_realized_pnl || 0;
    const totalPnL = unrealizedPnL + realizedPnL;

    return [
      h.symbol,
      h.asset_type,
      h.quantity.toString(),
      `${formatCurrency(h.purchase_price)} ₺`,
      `${formatCurrency(h.current_price)} ₺`,
      `${formatCurrency(currentValue)} ₺`,
      `${formatCurrency(totalPnL)} ₺`,
      `${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}%`
    ];
  });

  autoTable(doc, {
    startY: yPos,
    head: [['Sembol', 'Tür', 'Adet', 'Alış', 'Güncel', 'Değer', 'K/Z', 'K/Z %']],
    body: holdingsData,
    theme: 'striped',
    styles: { fontSize: 8 },
    headStyles: { fillColor: [59, 130, 246], fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 20 },
      1: { cellWidth: 20 },
      2: { cellWidth: 15 },
      3: { cellWidth: 25 },
      4: { cellWidth: 25 },
      5: { cellWidth: 25 },
      6: { cellWidth: 25 },
      7: { cellWidth: 20 }
    },
    margin: { left: 14, right: 14 }
  });

  yPos = (doc as any).lastAutoTable.finalY + 15;

  if (yPos > 250) {
    doc.addPage();
    yPos = 20;
  }

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('VARLIK TİPİNE GÖRE DAĞILIM', 14, yPos);

  yPos += 10;

  const assetTypeMap = new Map<string, { value: number; count: number }>();
  holdings.forEach(h => {
    const value = h.current_price * h.quantity;
    const current = assetTypeMap.get(h.asset_type) || { value: 0, count: 0 };
    assetTypeMap.set(h.asset_type, {
      value: current.value + value,
      count: current.count + 1
    });
  });

  const assetTypeData = Array.from(assetTypeMap.entries()).map(([type, data]) => {
    const percent = summary.totalValue > 0 ? (data.value / summary.totalValue) * 100 : 0;
    return [
      type,
      data.count.toString(),
      `${formatCurrency(data.value)} ₺`,
      `${percent.toFixed(2)}%`
    ];
  });

  autoTable(doc, {
    startY: yPos,
    head: [['Varlık Tipi', 'Adet', 'Toplam Değer', 'Oran']],
    body: assetTypeData,
    theme: 'striped',
    styles: { fontSize: 10 },
    headStyles: { fillColor: [59, 130, 246], fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 40 },
      1: { cellWidth: 30 },
      2: { cellWidth: 50 },
      3: { cellWidth: 30 }
    },
    margin: { left: 14 }
  });

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(128);
    doc.text(
      `Sayfa ${i} / ${pageCount}`,
      pageWidth / 2,
      doc.internal.pageSize.height - 10,
      { align: 'center' }
    );
  }

  const fileName = `portfolio-report-${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
}

export async function generateMonthlyReport(
  _holdings: Holding[],
  summary: PortfolioSummary,
  portfolioName: string,
  month: string,
  transactions: Transaction[] = []
) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  let yPos = 20;

  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('AYLIK PORTFÖY RAPORU', pageWidth / 2, yPos, { align: 'center' });

  yPos += 10;
  doc.setFontSize(12);
  doc.text(`${portfolioName} - ${month}`, pageWidth / 2, yPos, { align: 'center' });

  yPos += 10;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  const reportDate = new Date().toLocaleDateString('tr-TR');
  doc.text(`Rapor Tarihi: ${reportDate}`, pageWidth / 2, yPos, { align: 'center' });

  yPos += 15;
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('PERFORMANS ÖZETİ', 14, yPos);

  yPos += 10;
  const summaryData = [
    ['Dönem Sonu Değer:', `${formatCurrency(summary.totalValue)} ₺`],
    ['Toplam Yatırım:', `${formatCurrency(summary.totalInvestment)} ₺`],
    ['Dönem Kazanç/Kayıp:', `${formatCurrency(summary.totalPnL)} ₺`],
    ['Getiri Oranı:', `${summary.pnLPercent >= 0 ? '+' : ''}${summary.pnLPercent.toFixed(2)}%`],
  ];

  autoTable(doc, {
    startY: yPos,
    body: summaryData,
    theme: 'plain',
    styles: { fontSize: 10 },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 50 },
      1: { cellWidth: 'auto' }
    },
    margin: { left: 14 }
  });

  yPos = (doc as any).lastAutoTable.finalY + 15;

  if (transactions.length > 0) {
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('DÖNEM İÇİ İŞLEMLER', 14, yPos);

    yPos += 10;

    const transactionData = transactions.slice(0, 20).map(t => [
      new Date(t.transaction_date).toLocaleDateString('tr-TR'),
      t.transaction_type === 'buy' ? 'ALIŞ' : 'SATIŞ',
      t.quantity.toString(),
      `${formatCurrency(t.price)} ₺`,
      `${formatCurrency(t.total_amount)} ₺`
    ]);

    autoTable(doc, {
      startY: yPos,
      head: [['Tarih', 'İşlem', 'Adet', 'Fiyat', 'Tutar']],
      body: transactionData,
      theme: 'striped',
      styles: { fontSize: 9 },
      headStyles: { fillColor: [59, 130, 246] },
      margin: { left: 14, right: 14 }
    });
  }

  const fileName = `monthly-report-${month}-${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
}
