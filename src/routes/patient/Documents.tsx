import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  Button,
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
import { UploadPanel } from '../../components/Upload'
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
  const patientId = useRecordId()

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Upload a document"
        description="PDF, Word, image or anything else. It goes onto your record and shows on your story — nothing is shared with anybody by uploading it."
        breadcrumbs={[
          { label: 'Home', to: '/patient' },
          { label: 'Documents', to: '/patient/documents' },
          { label: 'Upload' },
        ]}
      />
      <UploadPanel patientId={patientId} />
      <LinkButton to="/patient/documents">Back to documents</LinkButton>
    </div>
  )
}
