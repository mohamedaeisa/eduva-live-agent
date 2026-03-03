import React from 'react';
import { Page, Text, View, Document, StyleSheet, Font } from '@react-pdf/renderer';
import { ExamData, StudyNoteData, QuizData, HomeworkData, CheatSheetData, StudyWithMeData, StudyNoteSection } from '../types';

/**
 * EDUVA PDF ENGINE v1.4
 * Arabic Glyph & RTL Support Implementation
 */

// Register Cairo Font for Arabic Support
Font.register({
  family: 'Cairo',
  fonts: [
    { src: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/cairo/Cairo-Regular.ttf', fontWeight: 'normal' },
    { src: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/cairo/Cairo-Bold.ttf', fontWeight: 'bold' },
  ],
});

const colors = {
  brand: '#4f46e5', 
  slate950: '#020617',
  slate900: '#0f172a',
  slate800: '#1e293b',
  slate700: '#334155',
  slate600: '#475569',
  slate400: '#94a3b8',
  slate100: '#f1f5f9',
  slate50: '#f8fafc',
  white: '#ffffff',
  amber700: '#b45309',
  red700: '#c53030',
  blueHighlight: '#ebf8ff',
  blueBorder: '#3182ce',
};

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: 'Cairo', // Switched from Helvetica to Cairo for Polyglot support
    backgroundColor: colors.white,
    color: colors.slate900,
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.slate100,
    paddingBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logoText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: colors.brand,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  docType: {
    fontSize: 7,
    fontWeight: 'bold',
    color: colors.slate400,
    textTransform: 'uppercase',
  },
  titleContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingBottom: 100,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 12,
    color: colors.slate950,
    textTransform: 'uppercase',
  },
  summary: {
    fontSize: 12,
    color: colors.slate600,
    fontStyle: 'italic',
    lineHeight: 1.5,
    borderLeftWidth: 2,
    borderLeftColor: colors.brand,
    paddingLeft: 12,
  },
  sectionWrapper: {
    marginBottom: 30,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.slate50,
  },
  sectionHeader: {
    marginBottom: 15,
    borderBottomWidth: 2,
    borderBottomColor: colors.slate50,
    paddingBottom: 8,
  },
  atomNumber: {
    fontSize: 8,
    fontWeight: 'bold',
    color: colors.brand,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  heading: {
    fontSize: 18,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    color: colors.slate950,
  },
  contentGrid: {
    flexDirection: 'row',
    gap: 20,
  },
  mainColumn: {
    flex: 2,
  },
  sideColumn: {
    flex: 1,
    backgroundColor: colors.slate50,
    padding: 12,
    borderRadius: 8,
  },
  listItem: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  bullet: {
    width: 12,
    fontSize: 10,
    color: colors.brand,
  },
  listText: {
    flex: 1,
    fontSize: 10,
    lineHeight: 1.6,
  },
  label: {
    fontSize: 7,
    fontWeight: 'bold',
    color: colors.slate400,
    textTransform: 'uppercase',
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  definition: {
    fontSize: 8,
    marginBottom: 6,
  },
  factBox: {
    marginBottom: 8,
  },
  factText: {
    fontSize: 8,
    fontWeight: 'bold',
    color: colors.slate900,
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    borderTopWidth: 1,
    borderTopColor: colors.slate100,
    paddingTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 6,
    fontWeight: 'bold',
    color: colors.slate400,
    textTransform: 'uppercase',
  },
  bold: {
    fontWeight: 'bold',
  },
  // --- CHEAT SHEET SPEC 2.0 STYLES ---
  csGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  csCard: {
    width: '31%',
    marginBottom: 12,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.slate100,
    borderRadius: 6,
    overflow: 'hidden',
  },
  csCardHeader: {
    backgroundColor: colors.slate800,
    padding: '6px 10px',
  },
  csHeading: {
    fontSize: 8,
    fontWeight: 'bold',
    color: colors.white,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  csBody: {
    padding: 10,
  },
  csDefBox: {
    backgroundColor: colors.blueHighlight,
    borderLeftWidth: 2,
    borderLeftColor: colors.blueBorder,
    padding: 6,
    marginBottom: 6,
    borderRadius: 2,
  },
  csDefText: {
    fontSize: 8,
    color: colors.slate800,
    fontWeight: 'bold',
    lineHeight: 1.3,
  },
  csFormulaBox: {
    backgroundColor: colors.slate50,
    borderWidth: 1,
    borderColor: colors.slate100,
    padding: 4,
    marginBottom: 6,
    borderRadius: 4,
    textAlign: 'center',
  },
  csFormulaText: {
    fontSize: 7,
    fontFamily: 'Courier',
    color: colors.brand,
  },
  csFooter: {
    backgroundColor: colors.slate50,
    padding: '8px 10px',
    borderTopWidth: 1,
    borderTopColor: colors.slate100,
  },
  csTipRow: {
    flexDirection: 'row',
    marginBottom: 4,
    alignItems: 'flex-start',
  },
  csIcon: {
    fontSize: 8,
    marginRight: 4,
    width: 10,
  },
  csTipText: {
    fontSize: 7,
    fontWeight: 'bold',
    color: colors.slate700,
    flex: 1,
  },
  csTrapText: {
    fontSize: 7,
    fontWeight: 'bold',
    color: colors.red700,
    flex: 1,
  }
});

const safeText = (t?: string | null | any): string => {
  if (typeof t === 'string') return t;
  return t ? String(t) : '';
};

const toSentenceCase = (str: string): string => {
  if (!str) return '';
  const s = safeText(str).toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/**
 * Utility: formatTitle
 * Converts raw kebab-case slugs into human-readable capitalized text.
 */
const formatTitle = (slug: string): string => {
  if (!slug) return '';
  return safeText(slug)
    .replace(/-/g, ' ')
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

/**
 * Utility: getFormattedDate
 * Returns non-ambiguous date (e.g. 3 Jan 2026) to prevent international confusion.
 */
const getFormattedDate = (): string => {
  return new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
};

const renderSafeRichText = (text: any, fontSize: number = 10) => {
  const str = safeText(text);
  if (!str) return <Text style={[styles.listText, { fontSize }]}>{''}</Text>;
  const parts = str.split(/(\*\*.*?\*\*|->)/g).filter(Boolean);
  
  return (
    <Text style={[styles.listText, { fontSize }]}>
      {parts.map((part, idx) => {
        const isBold = /^\*\*(.*)\*\*$/.test(part);
        const content = isBold ? part.replace(/^\*\*(.*)\*\*$/, '$1') : part === '->' ? ' → ' : part;
        return <Text key={idx} style={isBold ? styles.bold : {}}>{safeText(content)}</Text>;
      })}
    </Text>
  );
};

const GlobalFooter = ({ pageNumber, totalPages }: { pageNumber?: number; totalPages?: number }) => (
  <View style={styles.footer} fixed>
    <Text>EDUVA INTELLIGENCE CORE v6.5 • PROPRIETARY SYSTEM</Text>
    {pageNumber && totalPages && <Text>Page {pageNumber} of {totalPages}</Text>}
  </View>
);

const GlobalHeader = ({ title, sub }: { title: string; sub: string }) => (
  <View style={styles.header} fixed>
    <View>
      <Text style={styles.logoText}>EDUVA-Me</Text>
      <Text style={styles.docType}>{formatTitle(title)}</Text>
    </View>
    <Text style={styles.docType}>{safeText(sub)}</Text>
  </View>
);

const AtomSection: React.FC<{ section: any, idx: number, isCompact?: boolean }> = ({ section, idx, isCompact }) => (
  <View style={isCompact ? styles.sectionWrapper : {}} wrap={!isCompact}>
    <View style={styles.sectionHeader}>
      <Text style={styles.atomNumber}>Knowledge Atom Sequence: {String(idx + 1).padStart(3, '0')}</Text>
      <Text style={styles.heading}>{formatTitle(section.heading)}</Text>
    </View>

    <View style={styles.contentGrid}>
      <View style={styles.mainColumn}>
        <Text style={styles.label}>Core Neural Data</Text>
        {(section.keyPoints || []).map((point: any, pIdx: number) => (
          <View key={pIdx} style={styles.listItem}>
            <Text style={styles.bullet}>•</Text>
            {renderSafeRichText(point)}
          </View>
        ))}

        {section.definitions && section.definitions.length > 0 && (
          <View style={{ marginTop: 15 }}>
            <Text style={styles.label}>Terminology Mapping</Text>
            {section.definitions.map((def: any, dIdx: number) => (
              <Text key={dIdx} style={styles.definition}>
                <Text style={styles.bold}>{formatTitle(def.term)}: </Text>
                {safeText(def.definition)}
              </Text>
            ))}
          </View>
        )}
      </View>

      <View style={styles.sideColumn}>
        {section.examFacts && section.examFacts.length > 0 && (
          <View style={{ marginBottom: 15 }}>
            <Text style={styles.label}>Exam Intellect</Text>
            {section.examFacts.map((fact: any, fIdx: number) => (
              <View key={fIdx} style={styles.factBox}>
                <Text style={styles.factText}>🎯 {safeText(fact)}</Text>
              </View>
            ))}
          </View>
        )}

        {section.mnemonic && (
          <View>
            <Text style={styles.label}>Logic Projection</Text>
            <Text style={{ fontSize: 9, fontStyle: 'italic', color: colors.slate600, lineHeight: 1.4 }}>
              "{safeText(section.mnemonic)}"
            </Text>
          </View>
        )}
      </View>
    </View>
  </View>
);

/**
 * CHEAT SHEET V2: ATOM SYNTHESIS GRID
 * High-density 3-column grid focusing only on core academic facts.
 */
export const CheatSheetv2PdfDocument: React.FC<{ data: StudyWithMeData }> = ({ data }) => {
  if (!data) return null;
  const sections = Array.isArray(data.sections) ? data.sections : [];
  const displayTitle = formatTitle(data.title);

  return (
    <Document title={`${displayTitle} - Arabic Support Ready`}>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <GlobalHeader title={displayTitle} sub="ULTRA-DENSITY CRAM SHEET" />
        
        <View style={styles.csGrid}>
          {sections.map((sec, idx) => {
              const hasFormula = sec.keyPoints?.some((pt: string) => pt.includes('$') || pt.toLowerCase().includes('formula'));
              const formula = hasFormula ? sec.keyPoints?.find((pt: string) => pt.includes('$') || pt.toLowerCase().includes('formula'))?.replace(/formula:?\s*/i, '') : null;
              
              return (
                <View key={idx} style={styles.csCard} wrap={false}>
                  {/* Dark Header */}
                  <View style={styles.csCardHeader}>
                    <Text style={styles.csHeading}>{formatTitle(sec.heading)}</Text>
                  </View>
                  
                  <View style={styles.csBody}>
                    {/* Blue Highlighted Definition */}
                    <View style={styles.csDefBox}>
                      <Text style={styles.csDefText}>
                        {toSentenceCase(sec.keyPoints?.[0] || 'Definition pending...')}
                      </Text>
                    </View>

                    {/* Formula Box */}
                    {formula && (
                      <View style={styles.csFormulaBox}>
                        <Text style={styles.csFormulaText}>{formula}</Text>
                      </View>
                    )}
                  </View>

                  {/* Student-Facing Quick Wins */}
                  {sec.examFacts && sec.examFacts.length > 0 && (
                    <View style={styles.csFooter}>
                       {sec.examFacts.slice(0, 4).map((fact: string, fIdx: number) => {
                         const isTrap = fact.toLowerCase().startsWith('trap:');
                         return (
                           <View key={fIdx} style={styles.csTipRow}>
                             <Text style={styles.csIcon}>{isTrap ? '!' : 'o'}</Text>
                             <Text style={isTrap ? styles.csTrapText : styles.csTipText}>
                                {toSentenceCase(fact.replace(/trap:|tip:/gi, '').trim())}
                             </Text>
                           </View>
                         );
                       })}
                    </View>
                  )}
                </View>
              );
          })}
        </View>

        <GlobalFooter />
      </Page>
    </Document>
  );
};

export const StudySessionPdfDocument: React.FC<{ data: StudyWithMeData, mode?: 'FOCUS' | 'ECO' | 'CRAM' }> = ({ data, mode = 'FOCUS' }) => {
  if (!data) return null;
  const sections = Array.isArray(data.sections) ? data.sections : [];
  const displayTitle = formatTitle(data.title);
  const displayDate = getFormattedDate();

  if (mode === 'CRAM') {
    return <CheatSheetv2PdfDocument data={data} />;
  }

  return (
    <Document title={displayTitle || 'Study Guide'}>
      {/* PAGE 1: TITLE & SUMMARY (System Briefing) */}
      <Page size="A4" style={styles.page}>
        <GlobalHeader title="Master Knowledge Record" sub={displayDate} />
        <View style={styles.titleContainer}>
          <Text style={styles.title}>{displayTitle}</Text>
          <Text style={styles.summary}>{safeText(data.summaryMarkdown || data.summary)}</Text>
        </View>
        <GlobalFooter />
      </Page>

      {/* COMPACT MODE: One continuous page flow */}
      {mode === 'ECO' ? (
        <Page size="A4" style={styles.page}>
          <GlobalHeader title={displayTitle} sub="COMPACT KNOWLEDGE LAYER" />
          {sections.map((section, idx) => (
            <AtomSection key={idx} section={section} idx={idx} isCompact={true} />
          ))}
          <GlobalFooter />
        </Page>
      ) : (
        /* STANDARD MODE: One Atom Per Page */
        sections.map((section, idx) => (
          <Page key={idx} size="A4" style={styles.page}>
            <GlobalHeader title={displayTitle} sub={`ATOM #${String(idx + 1).padStart(2, '0')}`} />
            <AtomSection section={section} idx={idx} isCompact={false} />
            <GlobalFooter pageNumber={idx + 2} totalPages={sections.length + 1} />
          </Page>
        ))
      )}
    </Document>
  );
};

export const CheatSheetPdfDocument: React.FC<{ data: CheatSheetData }> = ({ data }) => {
  const contentStr = safeText(data?.content);
  if (!data || !contentStr) return null;
  const displayTopic = formatTitle(data.topic);

  const rawSections = contentStr.split(/\n(?=## )/g).filter(Boolean);
  const sections = rawSections.map(rs => {
    const lines = rs.trim().split('\n');
    const header = safeText(lines[0] || '').startsWith('## ') ? safeText(lines[0]).replace('## ', '') : 'Reference';
    return {
      header,
      content: lines.slice(1).filter(l => l.trim())
    };
  });

  return (
    <Document title={`${displayTopic || 'Reference'} - Cheat Sheet`}>
      <Page size="A4" orientation="landscape" style={{ ...styles.page, padding: 30 }}>
        <GlobalHeader title="Quick Reference Layer" sub={displayTopic} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {sections.map((sec, secIdx) => (
            <View key={secIdx} style={{ width: '31%', marginBottom: 12 }}>
              <Text style={{ fontSize: 9, fontWeight: 'bold', backgroundColor: colors.slate100, padding: 4, marginBottom: 5, textTransform: 'uppercase' }}>
                {formatTitle(sec.header)}
              </Text>
              {(sec.content || []).map((line: any, lIdx: number) => (
                <View key={lIdx} style={{ marginBottom: 2 }}>
                  <Text style={{ fontSize: 8 }}>
                    {safeText(line).startsWith('- ') ? '• ' : ''}
                    {renderSafeRichText(safeText(line).replace(/^[*-] /, ''), 8)}
                  </Text>
                </View>
              ))}
            </View>
          ))}
        </View>
        <GlobalFooter />
      </Page>
    </Document>
  );
};

export const NotesPdfDocument: React.FC<{ data: StudyNoteData, mode?: 'FOCUS' | 'ECO' | 'CRAM' }> = ({ data, mode }) => (
    <StudySessionPdfDocument data={data as any} mode={mode} />
);

export const ExamPdfDocument: React.FC<{ data: ExamData }> = ({ data }) => {
    if (!data) return null;
    const sections = Array.isArray(data.sections) ? data.sections : [];
    const displaySubject = formatTitle(data.subject);

    return (
        <Document title={displaySubject ? `${displaySubject} Examination` : 'Official Examination'}>
            <Page size="A4" style={styles.page}>
                <GlobalHeader title={safeText(data.schoolName) || 'EDUVA ACADEMY'} sub="Mock Examination" />
                <View style={{ marginBottom: 20 }}>
                    <Text style={{ fontSize: 18, fontWeight: 'bold' }}>{displaySubject}</Text>
                    <Text style={{ fontSize: 9, color: colors.slate600 }}>Grade: {safeText(data.grade)} | Duration: {safeText(data.duration)}</Text>
                </View>

                {sections.map((sec, sIdx) => {
                    const questions = Array.isArray(sec?.questions) ? sec.questions : [];
                    return (
                        <View key={sIdx} style={{ marginBottom: 20 }}>
                            <Text style={{ fontSize: 11, fontWeight: 'bold', backgroundColor: colors.slate50, padding: 5, textTransform: 'uppercase' }}>{formatTitle(sec?.title)}</Text>
                            <Text style={{ fontSize: 8, fontStyle: 'italic', marginBottom: 10, marginTop: 4 }}>{safeText(sec?.instructions)}</Text>
                            {questions.map((q, qIdx) => {
                                const options = Array.isArray(q?.options) ? q.options : [];
                                return (
                                    <View key={qIdx} style={{ marginBottom: 12, paddingLeft: 5 }}>
                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                            <Text style={{ fontSize: 10, fontWeight: 'bold', flex: 1 }}>
                                                {q?.number ? `${safeText(q.number)}. ` : ''}{safeText(q?.text)}
                                            </Text>
                                            <Text style={{ fontSize: 8, fontWeight: 'bold' }}>[{safeText(q?.marks || 1)} Marks]</Text>
                                        </View>
                                        {options.length > 0 && (
                                            <View style={{ marginTop: 5, paddingLeft: 15 }}>
                                                {options.map((opt, oIdx) => (
                                                    <Text key={oIdx} style={{ fontSize: 9, marginBottom: 2 }}>○ {safeText(opt)}</Text>
                                                ))}
                                            </View>
                                        )}
                                    </View>
                                );
                            })}
                        </View>
                    );
                })}
                <GlobalFooter />
            </Page>
        </Document>
    );
};

export const QuizPdfDocument: React.FC<{ data: QuizData }> = ({ data }) => {
    if (!data) return null;
    const questions = Array.isArray(data.questions) ? data.questions : [];
    const displayTitle = formatTitle(data.title);

    return (
        <Document title={displayTitle || 'Knowledge Assessment'}>
            <Page size="A4" style={styles.page}>
                <GlobalHeader title="EDUVA QUIZ" sub={displayTitle} />
                <Text style={styles.title}>{displayTitle}</Text>
                {questions.map((q, idx) => {
                    const options = Array.isArray(q?.options) ? q.options : [];
                    return (
                        <View key={idx} style={{ marginBottom: 15 }}>
                            <Text style={{ fontSize: 11, fontWeight: 'bold' }}>{`${idx + 1}. ${safeText(q?.question)}`}</Text>
                            {options.map((opt, oIdx) => (
                                <Text key={oIdx} style={{ fontSize: 9, marginLeft: 15, marginTop: 3 }}>[ ] {safeText(opt)}</Text>
                            ))}
                        </View>
                    );
                })}
                <GlobalFooter />
            </Page>
        </Document>
  );
};

export const HomeworkPdfDocument: React.FC<{ data: HomeworkData }> = ({ data }) => (
    <Document title="Homework Analysis Report">
        <Page size="A4" style={styles.page}>
            <GlobalHeader title="EDUVA FEEDBACK" sub="Analysis Report" />
            <Text style={styles.title}>Homework Analysis</Text>
            <Text style={{ fontSize: 10, lineHeight: 1.6 }}>{safeText(data?.feedback)}</Text>
            <GlobalFooter />
        </Page>
    </Document>
);