/**
 * Gerador mínimo de planilhas Excel (.xlsx), sem dependências: SpreadsheetML dentro de um ZIP
 * sem compressão. Suporta várias abas, texto, números com formato (moeda, %, inteiro, decimal),
 * linhas em negrito, larguras de coluna e congelar a linha de cabeçalho.
 */

export type FormatoCelula = 'texto' | 'moeda' | 'percentual' | 'inteiro' | 'decimal';

export interface AbaPlanilha {
  nome: string;
  linhas: (string | number | null | undefined)[][];
  /** Formato por coluna (números); texto é o padrão */
  formatos?: FormatoCelula[];
  /** Larguras por coluna (em caracteres) */
  larguras?: number[];
  /** Índices (0 = primeira) das linhas em negrito */
  negrito?: number[];
  /** Linha (0 = primeira) cujo fim fica congelado ao rolar (cabeçalho) */
  congelarAte?: number;
}

// Estilos (cellXfs): 0 normal · 1 negrito · 2 moeda · 3 % · 4 inteiro · 5 decimal · 6..9 = 2..5 em negrito
const ESTILO: Record<FormatoCelula, number> = { texto: 0, moeda: 2, percentual: 3, inteiro: 4, decimal: 5 };

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="&quot;R$&quot;\\ #,##0.00"/><numFmt numFmtId="165" formatCode="0.0%"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="10">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
<xf numFmtId="165" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
<xf numFmtId="3" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
<xf numFmtId="4" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

const esc = (s: string) =>
  s
    // caracteres de controle não são aceitos no XML
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function coluna(i: number): string {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** Nome de aba válido no Excel: até 31 caracteres, sem : \ / ? * [ ] e sem repetir. */
function nomeDeAba(nome: string, usados: Set<string>): string {
  let base =
    nome
      .replace(/[:\\/?*[\]]/g, ' ')
      .trim()
      .slice(0, 31) || 'Planilha';
  let n = 2;
  let r = base;
  while (usados.has(r.toLowerCase())) r = `${base.slice(0, 28)} ${n++}`;
  usados.add(r.toLowerCase());
  return r;
}

function folha(a: AbaPlanilha): string {
  const negrito = new Set(a.negrito ?? []);
  const linhas = a.linhas
    .map((l, r) => {
      const b = negrito.has(r);
      const celulas = l
        .map((v, c) => {
          if (v === null || v === undefined || v === '') return '';
          const ref = `${coluna(c)}${r + 1}`;
          if (typeof v === 'number' && Number.isFinite(v)) {
            const base = ESTILO[a.formatos?.[c] ?? 'texto'];
            const s = base === 0 ? (b ? 1 : 0) : b ? base + 4 : base;
            return `<c r="${ref}" s="${s}"><v>${v}</v></c>`;
          }
          return `<c r="${ref}" t="inlineStr"${b ? ' s="1"' : ''}><is><t xml:space="preserve">${esc(String(v))}</t></is></c>`;
        })
        .join('');
      return `<row r="${r + 1}">${celulas}</row>`;
    })
    .join('');
  const cols = a.larguras?.length
    ? `<cols>${a.larguras.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
    : '';
  const painel =
    a.congelarAte !== undefined
      ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${a.congelarAte + 1}" topLeftCell="A${a.congelarAte + 2}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
      : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${painel}${cols}<sheetData>${linhas}</sheetData></worksheet>`;
}

/** Monta o arquivo .xlsx (Buffer) com as abas informadas. */
export function gerarXlsx(abas: AbaPlanilha[]): Buffer {
  if (!abas.length) throw new Error('A planilha precisa de ao menos uma aba');
  const usados = new Set<string>();
  const nomes = abas.map((a) => nomeDeAba(a.nome, usados));
  const arquivos: [string, string][] = [
    [
      '[Content_Types].xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${abas
        .map(
          (_, i) =>
            `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
        )
        .join('')}</Types>`,
    ],
    [
      '_rels/.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ],
    [
      'xl/workbook.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${nomes
        .map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
        .join('')}</sheets></workbook>`,
    ],
    [
      'xl/_rels/workbook.xml.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${abas
        .map(
          (_, i) =>
            `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
        )
        .join(
          '',
        )}<Relationship Id="rId${abas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    ],
    ['xl/styles.xml', STYLES],
    ...abas.map((a, i): [string, string] => [`xl/worksheets/sheet${i + 1}.xml`, folha(a)]),
  ];
  return zipSemCompressao(arquivos.map(([nome, conteudo]) => [nome, Buffer.from(conteudo, 'utf8')]));
}

// ── ZIP (método "store") ────────────────────────────────────

const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(b: Buffer): number {
  let c = 0xffffffff;
  for (const byte of b) c = TABELA_CRC[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** 01/01/1980 no formato de data do DOS (o ZIP não aceita data zerada) */
const DATA_DOS = (0 << 9) | (1 << 5) | 1;

function zipSemCompressao(arquivos: [string, Buffer][]): Buffer {
  const partes: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [nome, dados] of arquivos) {
    const n = Buffer.from(nome, 'utf8');
    const crc = crc32(dados);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // versão
    local.writeUInt16LE(0x0800, 6); // nomes em UTF-8
    local.writeUInt16LE(0, 8); // store
    local.writeUInt16LE(0, 10); // hora
    local.writeUInt16LE(DATA_DOS, 12); // data
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(dados.length, 18);
    local.writeUInt32LE(dados.length, 22);
    local.writeUInt16LE(n.length, 26);
    local.writeUInt16LE(0, 28);
    partes.push(local, n, dados);

    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(0x0800, 8);
    c.writeUInt16LE(0, 10);
    c.writeUInt16LE(0, 12);
    c.writeUInt16LE(DATA_DOS, 14);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(dados.length, 20);
    c.writeUInt32LE(dados.length, 24);
    c.writeUInt16LE(n.length, 28);
    c.writeUInt16LE(0, 30);
    c.writeUInt16LE(0, 32);
    c.writeUInt16LE(0, 34);
    c.writeUInt16LE(0, 36);
    c.writeUInt32LE(0, 38);
    c.writeUInt32LE(offset, 42);
    central.push(c, n);
    offset += local.length + n.length + dados.length;
  }
  const dir = Buffer.concat(central);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(0, 4);
  fim.writeUInt16LE(0, 6);
  fim.writeUInt16LE(arquivos.length, 8);
  fim.writeUInt16LE(arquivos.length, 10);
  fim.writeUInt32LE(dir.length, 12);
  fim.writeUInt32LE(offset, 16);
  fim.writeUInt16LE(0, 20);
  return Buffer.concat([...partes, dir, fim]);
}
