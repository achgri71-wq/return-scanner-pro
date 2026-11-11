import type { Cell, Sheet, SheetData } from 'write-excel-file/browser'
import type {
  AuditEntry,
  BlacklistEntry,
  Language,
  ReturnList,
  ReturnParcel,
  ScanEvent,
  ScanSession,
  ScannedCode,
  SessionReportSnapshot,
} from '../types'
import { downloadCsv, downloadText, formatDateTime, sanitizeFilename } from './utils'

type SheetSpec = Sheet<Blob>

const LABELS = {
  fr: {
    list: 'Liste',
    listId: 'Identifiant',
    status: 'Statut',
    created: 'Créée le',
    source: 'Source',
    notes: 'Notes',
    total: 'Colis requis',
    returned: 'Retournés',
    remaining: 'Restants',
    completion: 'Progression',
    code: 'Code colis',
    added: 'Ajouté le',
    returnedAt: 'Retourné le',
    returnedBy: 'Agent',
    attempt: 'Tentative',
    result: 'Résultat',
    date: 'Date',
    employee: 'Employé',
    listName: 'Nom de la liste',
    reason: 'Motif',
    addedBy: 'Ajouté par',
    lastAttempt: 'Dernière tentative',
    firstScan: 'Premier scan',
    attempts: 'Tentatives',
    session: 'Session',
    started: 'Début',
    ended: 'Fin',
    scans: 'Scans',
    accepted: 'Acceptés',
    unrequested: 'Non demandés',
    blacklisted: 'Interdits',
    duplicates: 'Doublons',
    otherList: 'Autre liste',
    summary: 'Résumé',
    codes: 'Codes',
    events: 'Événements',
    registry: 'Registre',
    blacklist: 'Liste noire',
    completionPct: 'Progression (%)',
    report: 'Rapport de session',
    generated: 'Généré le',
    noData: 'Aucune donnée',
  },
  ar: {
    list: 'القائمة',
    listId: 'المعرف',
    status: 'الحالة',
    created: 'تاريخ الإنشاء',
    source: 'المصدر',
    notes: 'ملاحظات',
    total: 'الطرود المطلوبة',
    returned: 'المرتجعة',
    remaining: 'المتبقية',
    completion: 'نسبة الإنجاز',
    code: 'رمز الطرد',
    added: 'تاريخ الإضافة',
    returnedAt: 'تاريخ الإرجاع',
    returnedBy: 'الموظف',
    attempt: 'المحاولة',
    result: 'النتيجة',
    date: 'التاريخ',
    employee: 'الموظف',
    listName: 'اسم القائمة',
    reason: 'السبب',
    addedBy: 'أضيف بواسطة',
    lastAttempt: 'آخر محاولة',
    firstScan: 'أول مسح',
    attempts: 'المحاولات',
    session: 'الجلسة',
    started: 'البداية',
    ended: 'النهاية',
    scans: 'عمليات المسح',
    accepted: 'المقبولة',
    unrequested: 'غير المطلوبة',
    blacklisted: 'المحظورة',
    duplicates: 'المكررة',
    otherList: 'قائمة أخرى',
    summary: 'ملخص',
    codes: 'الأكواد',
    events: 'الأحداث',
    registry: 'السجل',
    blacklist: 'القائمة السوداء',
    completionPct: 'نسبة الإنجاز (%)',
    report: 'تقرير الجلسة',
    generated: 'تم الإنشاء في',
    noData: 'لا توجد بيانات',
  },
} as const

const STATUS_LABELS: Record<Language, Record<string, string>> = {
  fr: {
    pending: 'En attente',
    returned: 'Retourné',
    'not-required': 'Non demandé',
    'return-prohibited': 'Retour interdit',
    'required-returned': 'Requis et retourné',
    new: 'Nouvelle',
    active: 'Active',
    completed: 'Terminée',
    archived: 'Archivée',
    manual: 'Manuel',
    import: 'Import',
    merge: 'Fusion',
    replace: 'Remplacement',
    backup: 'Restauration',
    accepted: 'Accepté',
    duplicate: 'Déjà enregistré',
    blacklisted: 'Interdit',
    'other-list': 'Autre liste',
    'not-required-scan': 'Non demandé',
    open: 'Ouverte',
    closed: 'Fermée',
  },
  ar: {
    pending: 'قيد الانتظار',
    returned: 'مرتجع',
    'not-required': 'غير مطلوب',
    'return-prohibited': 'الإرجاع ممنوع',
    'required-returned': 'مطلوب ومرتجع',
    new: 'جديدة',
    active: 'نشطة',
    completed: 'مكتملة',
    archived: 'مؤرشفة',
    manual: 'يدوي',
    import: 'استيراد',
    merge: 'دمج',
    replace: 'استبدال',
    backup: 'استعادة',
    accepted: 'مقبول',
    duplicate: 'مسجل مسبقاً',
    blacklisted: 'محظور',
    'other-list': 'قائمة أخرى',
    'not-required-scan': 'غير مطلوب',
    open: 'مفتوحة',
    closed: 'مغلقة',
  },
}

function statusText(status: string, lang: Language): string {
  return STATUS_LABELS[lang][status] ?? status
}

function headerCell(value: string): Cell {
  return {
    value,
    fontWeight: 'bold',
    backgroundColor: '#0e1b33',
    textColor: '#dce9ff',
    height: 22,
  }
}

function headerRow(labels: string[]): Cell[] {
  return labels.map(headerCell)
}

function strike(text: string): Cell {
  return { value: text, type: String }
}

async function writeWorkbook(sheets: SheetSpec[], filename: string, lang: Language): Promise<void> {
  const { default: writeXlsxFile } = await import('write-excel-file/browser')
  await writeXlsxFile(
    sheets.map((sheet) => ({ ...sheet, rightToLeft: lang === 'ar' })),
    { fontFamily: 'Calibri', fontSize: 11 },
  ).toFile(sanitizeFilename(filename))
}

export async function exportRowsXlsx(
  title: string,
  headers: string[],
  rows: string[][],
  filename: string,
  lang: Language,
): Promise<void> {
  const data: SheetData = [headerRow(headers), ...rows.map((row) => row.map(strike))]
  if (!rows.length) data.push([LABELS[lang].noData])
  await writeWorkbook(
    [{ data, sheet: title.slice(0, 31), columns: headers.map(() => ({ width: 24 })) }],
    filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`,
    lang,
  )
}

export async function exportListXlsx(
  list: ReturnList,
  parcels: ReturnParcel[],
  blacklistedCodes: Set<string>,
  lang: Language,
): Promise<void> {
  const labels = LABELS[lang]
  const scoped = parcels.filter((parcel) => parcel.listId === list.id)
  const returned = scoped.filter(
    (parcel) => parcel.status === 'returned' && !blacklistedCodes.has(parcel.code),
  ).length
  const summary: SheetData = [
    [headerCell(labels.summary)],
    [labels.listName, list.name],
    [labels.listId, list.id],
    [labels.status, statusText(list.status, lang)],
    [labels.created, formatDateTime(list.createdAt, lang)],
    [labels.source, statusText(list.source, lang)],
    [labels.notes, list.notes || '—'],
    [labels.total, scoped.length],
    [labels.returned, returned],
    [labels.remaining, scoped.length - returned],
    [labels.completionPct, scoped.length ? Math.round((returned / scoped.length) * 100) : 0],
  ]
  const codes: SheetData = [
    headerRow([labels.code, labels.status, labels.added, labels.returnedAt, labels.returnedBy]),
    ...scoped
      .slice()
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((parcel) => [
        parcel.code,
        statusText(parcel.status, lang),
        formatDateTime(parcel.addedAt, lang),
        parcel.returnedAt ? formatDateTime(parcel.returnedAt, lang) : '',
        parcel.returnedBy ?? '',
      ]),
  ]
  await writeWorkbook(
    [
      { data: summary, sheet: labels.summary, columns: [{ width: 24 }, { width: 44 }] },
      { data: codes, sheet: labels.codes, columns: [{ width: 28 }, { width: 18 }, { width: 20 }, { width: 20 }, { width: 22 }] },
    ],
    `${sanitizeFilename(list.name)}-${list.id}.xlsx`,
    lang,
  )
}

export async function exportRegistryXlsx(
  registry: ScannedCode[],
  listNames: Map<string, string>,
  lang: Language,
): Promise<void> {
  const labels = LABELS[lang]
  const headers = [
    labels.code,
    labels.status,
    labels.list,
    labels.firstScan,
    labels.lastAttempt,
    labels.attempts,
    labels.result,
  ]
  const rows = registry
    .slice()
    .sort((a, b) => b.lastAttemptAt.localeCompare(a.lastAttemptAt))
    .map((entry) => [
      entry.code,
      statusText(entry.status, lang),
      listNames.get(entry.listId) ?? entry.listId,
      formatDateTime(entry.firstScanAt, lang),
      formatDateTime(entry.lastAttemptAt, lang),
      String(entry.attempts),
      statusText(entry.lastResult, lang),
    ])
  await exportRowsXlsx(labels.registry, headers, rows, `registre-scans-${Date.now()}.xlsx`, lang)
}

export async function exportBlacklistXlsx(entries: BlacklistEntry[], lang: Language): Promise<void> {
  const labels = LABELS[lang]
  await exportRowsXlsx(
    labels.blacklist,
    [labels.code, labels.reason, labels.addedBy, labels.date],
    entries.map((entry) => [
      entry.code,
      entry.reason,
      entry.addedBy,
      formatDateTime(entry.addedAt, lang),
    ]),
    `liste-noire-${Date.now()}.xlsx`,
    lang,
  )
}

export async function exportEventsXlsx(
  events: ScanEvent[],
  lang: Language,
): Promise<void> {
  const labels = LABELS[lang]
  await exportRowsXlsx(
    labels.events,
    [labels.date, labels.code, labels.list, labels.employee, labels.result, labels.attempt],
    events
      .slice()
      .sort((a, b) => b.at.localeCompare(a.at))
      .map((event) => [
        formatDateTime(event.at, lang),
        event.code,
        event.listName,
        event.employeeName ?? '',
        statusText(event.result, lang),
        event.source,
      ]),
    `journal-scans-${Date.now()}.xlsx`,
    lang,
  )
}

export function exportReportCsv(
  report: SessionReportSnapshot,
  events: ScanEvent[],
  lang: Language,
): void {
  const fr = lang === 'fr'
  const rows: string[][] = [
    [fr ? 'champ' : 'الحقل', fr ? 'valeur' : 'القيمة'],
    [fr ? 'liste' : 'القائمة', report.listName],
    ['list_id', report.listId],
    ['session', report.sessionId],
    ['started_at', formatDateTime(report.startedAt, lang)],
    ['ended_at', formatDateTime(report.endedAt, lang)],
    ['total_required', String(report.listTotal)],
    ['returned', String(report.listReturned)],
    ['remaining', String(report.listRemaining)],
    ['completion', `${Math.round(report.completion * 100)}%`],
    ['session_scans', String(report.sessionScans)],
    ['session_accepted', String(report.sessionAccepted)],
    ['unrequested', String(report.unrequested)],
    ['blacklisted_attempts', String(report.blacklistedAttempts)],
    ['duplicate_attempts', String(report.duplicateAttempts)],
    ['other_list_attempts', String(report.otherListAttempts)],
    [],
    [fr ? 'date' : 'التاريخ', 'code', fr ? 'employé' : 'الموظف', fr ? 'résultat' : 'النتيجة', 'source'],
    ...events.map((event) => [
      formatDateTime(event.at, lang),
      event.code,
      event.employeeName ?? '',
      event.result,
      event.source,
    ]),
  ]
  downloadCsv(rows, `rapport-${sanitizeFilename(report.listName)}-${report.sessionId}.csv`)
}

export function exportReportTxt(report: SessionReportSnapshot, lang: Language): void {
  const fr = lang === 'fr'
  const lines = [
    fr ? 'RAPPORT DE SESSION DE RETOUR' : 'تقرير جلسة الإرجاع',
    '='.repeat(34),
    `${fr ? 'Liste' : 'القائمة'} : ${report.listName}`,
    `${fr ? 'Identifiant liste' : 'معرف القائمة'} : ${report.listId}`,
    `${fr ? 'Session' : 'الجلسة'} : ${report.sessionId}`,
    `${fr ? 'Employé' : 'الموظف'} : ${report.employeeName ?? '—'}`,
    `${fr ? 'Début' : 'البداية'} : ${formatDateTime(report.startedAt, lang)}`,
    `${fr ? 'Fin' : 'النهاية'} : ${formatDateTime(report.endedAt, lang)}`,
    '',
    `${fr ? 'Colis requis' : 'الطرود المطلوبة'} : ${report.listTotal}`,
    `${fr ? 'Retournés' : 'المرتجعة'} : ${report.listReturned}`,
    `${fr ? 'Restants' : 'المتبقية'} : ${report.listRemaining}`,
    `${fr ? 'Progression' : 'نسبة الإنجاز'} : ${Math.round(report.completion * 100)}%`,
    '',
    `${fr ? 'Scans de la session' : 'عمليات مسح الجلسة'} : ${report.sessionScans}`,
    `${fr ? 'Acceptés dans la session' : 'المقبولة في الجلسة'} : ${report.sessionAccepted}`,
    `${fr ? 'Codes non demandés' : 'الأكواد غير المطلوبة'} : ${report.unrequested}`,
    `${fr ? 'Tentatives de codes interdits' : 'محاولات الأكواد المحظورة'} : ${report.blacklistedAttempts}`,
    `${fr ? 'Tentatives répétées' : 'المحاولات المكررة'} : ${report.duplicateAttempts}`,
    `${fr ? 'Codes d’autres listes' : 'أكواد من قوائم أخرى'} : ${report.otherListAttempts}`,
  ]
  downloadText(`\uFEFF${lines.join('\r\n')}`, `rapport-${sanitizeFilename(report.listName)}-${report.sessionId}.txt`)
}

export async function exportReportXlsx(
  report: SessionReportSnapshot,
  parcels: ReturnParcel[],
  events: ScanEvent[],
  lang: Language,
): Promise<void> {
  const labels = LABELS[lang]
  const summary: SheetData = [
    [headerCell(labels.report)],
    [labels.listName, report.listName],
    [labels.listId, report.listId],
    [labels.session, report.sessionId],
    [labels.employee, report.employeeName ?? '—'],
    [labels.started, formatDateTime(report.startedAt, lang)],
    [labels.ended, formatDateTime(report.endedAt, lang)],
    [labels.total, report.listTotal],
    [labels.returned, report.listReturned],
    [labels.remaining, report.listRemaining],
    [labels.completionPct, Math.round(report.completion * 100)],
    [labels.scans, report.sessionScans],
    [labels.accepted, report.sessionAccepted],
    [labels.unrequested, report.unrequested],
    [labels.blacklisted, report.blacklistedAttempts],
    [labels.duplicates, report.duplicateAttempts],
    [labels.otherList, report.otherListAttempts],
    [labels.generated, formatDateTime(report.generatedAt, lang)],
  ]
  const codes: SheetData = [
    headerRow([labels.code, labels.status, labels.returnedAt, labels.returnedBy]),
    ...parcels
      .filter((parcel) => parcel.listId === report.listId)
      .slice()
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((parcel) => [
        parcel.code,
        statusText(parcel.status, lang),
        parcel.returnedAt ? formatDateTime(parcel.returnedAt, lang) : '',
        parcel.returnedBy ?? '',
      ]),
  ]
  const eventRows: SheetData = [
    headerRow([labels.date, labels.code, labels.result, labels.employee]),
    ...events
      .slice()
      .sort((a, b) => b.at.localeCompare(a.at))
      .map((event) => [
        formatDateTime(event.at, lang),
        event.code,
        statusText(event.result, lang),
        event.employeeName ?? '',
      ]),
  ]
  await writeWorkbook(
    [
      { data: summary, sheet: labels.summary, columns: [{ width: 24 }, { width: 46 }] },
      { data: codes, sheet: labels.codes, columns: [{ width: 28 }, { width: 18 }, { width: 20 }, { width: 22 }] },
      { data: eventRows, sheet: labels.events, columns: [{ width: 20 }, { width: 28 }, { width: 18 }, { width: 22 }] },
    ],
    `rapport-${sanitizeFilename(report.listName)}-${report.sessionId}.xlsx`,
    lang,
  )
}

export async function exportSessionXlsx(session: ScanSession, lang: Language): Promise<void> {
  if (!session.report) return
  await exportRowsXlsx(
    LABELS[lang].report,
    [LABELS[lang].session, LABELS[lang].list, LABELS[lang].accepted, LABELS[lang].remaining, LABELS[lang].completion],
    [
      [
        session.id,
        session.listName,
        String(session.report.listReturned),
        String(session.report.listRemaining),
        `${Math.round(session.report.completion * 100)}%`,
      ],
    ],
    `session-${session.id}.xlsx`,
    lang,
  )
}

const AUDIT_LABELS: Record<Language, string[]> = {
  fr: ['Date', 'Action', 'Acteur', 'Cible', 'Détail', 'Avant', 'Après'],
  ar: ['التاريخ', 'الإجراء', 'الفاعل', 'الهدف', 'التفاصيل', 'قبل', 'بعد'],
}

export function exportAuditCsv(entries: AuditEntry[], lang: Language): void {
  const rows: string[][] = [
    AUDIT_LABELS[lang],
    ...entries
      .slice()
      .sort((a, b) => b.at.localeCompare(a.at))
      .map((entry) => [
        formatDateTime(entry.at, lang),
        entry.action,
        entry.actor,
        entry.target ?? '',
        entry.detail,
        entry.before ?? '',
        entry.after ?? '',
      ]),
  ]
  downloadCsv(rows, `journal-audit-${Date.now()}.csv`)
}
