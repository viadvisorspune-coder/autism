import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  Button,
  Callout,
  Card,
  CardBody,
  CardHead,
  DefinitionList,
  FilterChips,
  LinkButton,
  PageHeader,
  Tag,
  formatDate,
} from '../../components/ui'
import { documents, documentsFor, personName, timeline } from '../../data/db'
import { useUI } from '../../state/ui'
import { useRecordId } from '../../state/record'

const CATEGORIES = ['All', 'Clinical', 'Therapy', 'OT', 'Employment', 'University', 'Statutory', 'Personal']

/** 10.1 Document library. */
export function PatientDocuments() {
  const patientId = useRecordId()
  const [filter, setFilter] = useState('All')
  const docs = documentsFor(patientId).filter((d) => filter === 'All' || d.category === filter)

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Documents"
        description="Everything you have uploaded or received. ORCA reads them, but nothing goes into your record until you say so."
        breadcrumbs={[{ label: 'Home', to: '/patient' }, { label: 'Documents' }]}
        actions={<LinkButton to="/patient/documents/upload" variant="primary">Upload a document</LinkButton>}
      />

      <div className="mb-5">
        <FilterChips options={CATEGORIES} active={filter} onChange={setFilter} />
      </div>

      <ul className="space-y-3">
        {docs.map((doc) => (
          <li key={doc.id}>
            <Link
              to={`/patient/documents/${doc.id}`}
              className="flex flex-wrap items-start justify-between gap-3 rounded-[20px]  bg-surface-2 px-5 py-4 hover:border-line-strong"
            >
              <div>
                <p className="text-[0.93rem] font-medium text-ink">{doc.title}</p>
                <p className="mt-0.5 text-[0.8rem] text-muted">
                  {doc.category} · {doc.fileType} · {formatDate(doc.date)} · from{' '}
                  {personName(doc.sourceId)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Tag>{doc.status}</Tag>
                <Tag>
                  {doc.access.length > 3 ? 'Care team' : doc.access.length === 1 ? 'Only you' : 'Limited'}
                </Tag>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** 10.2 Document detail. */
export function PatientDocument() {
  const { documentId } = useParams()
  const { say } = useUI()
  const doc = documents.find((d) => d.id === documentId)
  const [extracted, setExtracted] = useState(doc?.extracted ?? [])

  if (!doc) return <p className="text-[0.9rem] text-muted">Document not found.</p>

  const related = timeline.filter((e) => doc.relatedEventIds.includes(e.id))

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={doc.title}
        breadcrumbs={[
          { label: 'Home', to: '/patient' },
          { label: 'Documents', to: '/patient/documents' },
          { label: 'Document' },
        ]}
        actions={
          <>
            <Button onClick={() => say('ORCA can explain any part of this document in plain language.')}>
              Explain with ORCA
            </Button>
            <Button onClick={() => say('Choose a recipient and purpose to share this.')}>Share</Button>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card>
            <CardHead title="Preview" meta={`${doc.fileType} · ${formatDate(doc.date)}`} />
            <CardBody>
              <div className="flex h-56 items-center justify-center rounded-2xl  border-dashed border-line-strong bg-surface-2 text-[0.85rem] text-muted">
                Document preview
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHead
              title="What ORCA found in this document"
              meta="Nothing here is part of your record until you accept it"
            />
            <CardBody>
              <ul className="space-y-3">
                {extracted.map((item, i) => (
                  <li
                    key={item.label}
                    className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3 last:border-0 last:pb-0"
                  >
                    <div>
                      <p className="text-[0.8rem] text-muted">{item.label}</p>
                      <p className="text-[0.9rem] text-ink">{item.value}</p>
                    </div>
                    {item.accepted ? (
                      <Tag>Accepted</Tag>
                    ) : (
                      <div className="flex gap-2">
                        <Button
                          onClick={() => {
                            setExtracted(extracted.map((e, j) => (i === j ? { ...e, accepted: true } : e)))
                            say('Added to your record.')
                          }}
                        >
                          Add to my record
                        </Button>
                        <Button onClick={() => say('Left out. It stays in the document only.')}>
                          Leave out
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHead title="Details" />
            <CardBody>
              <DefinitionList
                items={[
                  { label: 'Source', value: personName(doc.sourceId) },
                  { label: 'Date', value: formatDate(doc.date) },
                  { label: 'Category', value: doc.category },
                  { label: 'Status', value: doc.status },
                  {
                    label: 'Who can see it',
                    value: doc.access.length === 1 ? 'Only you' : doc.access.join(', '),
                  },
                ]}
              />
            </CardBody>
          </Card>

          {related.length ? (
            <Card>
              <CardHead title="Related events" />
              <CardBody>
                <ul className="space-y-2">
                  {related.map((e) => (
                    <li key={e.id}>
                      <Link to={`/patient/story/${e.id}`} className="text-[0.86rem] text-ink hover:underline">
                        {e.title}
                      </Link>
                      <span className="block text-[0.78rem] text-muted">{formatDate(e.date)}</span>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHead title="Sharing history" />
            <CardBody>
              {doc.sharingHistory.length === 0 ? (
                <p className="text-[0.85rem] text-muted">This document has never been shared.</p>
              ) : (
                <ul className="space-y-2">
                  {doc.sharingHistory.map((s) => (
                    <li key={s.date + s.recipient} className="text-[0.85rem] text-ink">
                      {s.recipient}
                      <span className="block text-[0.78rem] text-muted">
                        {formatDate(s.date)} · {s.purpose}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  )
}

/** 10.3 Document upload. */
export function PatientDocumentUpload() {
  const { say } = useUI()
  const stages = ['Uploaded', 'Analysing', 'Extracting', 'Your review', 'Saved']
  const [stage, setStage] = useState(-1)

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Upload a document"
        description="PDF, Word, image or a structured document. ORCA will read it and show you what it found — nothing is added to your record automatically."
        breadcrumbs={[
          { label: 'Home', to: '/patient' },
          { label: 'Documents', to: '/patient/documents' },
          { label: 'Upload' },
        ]}
      />

      <Card className="mb-6">
        <CardBody>
          <div className="flex flex-col items-center justify-center rounded-[20px]  border-dashed border-line-strong bg-surface-2 px-6 py-10 text-center">
            <p className="text-[0.92rem] font-medium text-ink">Drop a file here, or choose one</p>
            <p className="mt-1 text-[0.83rem] text-muted">PDF · DOCX · Image · Structured document</p>
            <Button
              variant="primary"
              className="mt-4"
              onClick={() => {
                setStage(0)
                say('Upload started.')
                ;[1, 2, 3].forEach((s, i) => window.setTimeout(() => setStage(s), (i + 1) * 900))
              }}
            >
              Choose a file
            </Button>
          </div>
        </CardBody>
      </Card>

      {stage >= 0 ? (
        <Card className="mb-6">
          <CardHead title="Processing" meta="employer-handbook-extract.docx" />
          <CardBody>
            <ol className="flex flex-wrap gap-2">
              {stages.map((s, i) => (
                <li
                  key={s}
                  className={`rounded-full  px-3 py-1.5 text-[0.8rem] ${
                    i < stage
                      ? 'bg-state-good-tint text-state-good'
                      : i === stage
                        ? 'border-brand bg-brand-tint text-brand-ink'
                        : 'border-line text-muted'
                  }`}
                >
                  {s}
                </li>
              ))}
            </ol>
            {stage >= 3 ? (
              <div className="mt-4">
                <LinkButton to="/patient/documents/doc-3" variant="primary">
                  Review what ORCA found
                </LinkButton>
              </div>
            ) : null}
          </CardBody>
        </Card>
      ) : null}

      <Callout tone="info" title="Extracted information waits for you">
        ORCA does not put anything from a document into your record on its own. You decide, item by
        item, what becomes part of your story.
      </Callout>
    </div>
  )
}
