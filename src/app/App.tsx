import { Navigate, Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'
import AppShell from './shell/AppShell'
import { useSession } from '../state/session'
import { WorkflowChat } from '../routes/chat/Chat'
import { Login } from '../routes/auth/Auth'
import Onboarding from '../routes/auth/Onboarding'

import Shell from '../orca/Shell'
import OrcaHome from '../orca/Home'
import Ask from '../orca/Ask'
import Answer from '../orca/Answer'
import OrcaRecord, { Entry } from '../orca/Record'
import OrcaDecisions from '../orca/Decisions'
import OrcaDocuments from '../orca/Documents'
import OrcaSharing from '../orca/Sharing'
import OrcaCaseload from '../orca/Caseload'
import OrcaAdjust from '../orca/Adjust'
import OrcaNotes from '../orca/Notes'
import OrcaTasks from '../orca/Tasks'
import OrcaStrategies from '../orca/Strategies'
import OrcaRequests from '../orca/Requests'
import OrcaRegister from '../orca/Register'
import OrcaAppointments from '../orca/Appointments'
import { Access, Health, Incidents, Runs } from '../orca/Admin'
import { hasCaseload, homeFor } from '../orca/system'

import PatientHome from '../routes/patient/Home'
import PatientGuide from '../routes/patient/Guide'
import { PatientStory, PatientStoryEvent } from '../routes/patient/Story'
import PatientProfile from '../routes/patient/Profile'
import { PatientStrategy, PatientSupport } from '../routes/patient/Support'
import {
  PatientAppointment,
  PatientAppointmentPrep,
  PatientCare,
  PatientCareTeam,
} from '../routes/patient/Care'
import { PatientDisclosureRoute, PatientRequestBuilder, PatientWork } from '../routes/patient/Work'
import {
  PatientDocument,
  PatientDocumentUpload,
  PatientDocuments,
} from '../routes/patient/Documents'
import { PatientConnection, PatientConnections } from '../routes/patient/Connections'
import { PatientPrivacy, PatientSharingHistory } from '../routes/patient/Privacy'
import { PatientRequest, PatientRequests } from '../routes/patient/Requests'
import PatientProgress from '../routes/patient/Progress'

import Calendar from '../routes/shared/Calendar'
import AddInformation from '../routes/shared/AddInformation'
import ClinicalDashboard from '../routes/clinical/Dashboard'
import {
  ClinicalAppointments,
  ClinicalPatients,
  ClinicalTimeline,
} from '../routes/clinical/Patients'
import PatientRecord from '../routes/clinical/Record'
import SessionWorkspace from '../routes/clinical/Session'
import MemoryReview from '../routes/clinical/Memory'
import { OutcomesView, StrategyDetail, StrategyHistory } from '../routes/clinical/Strategies'
import HandoverBuilder from '../routes/clinical/Handover'
import {
  AdaptationTrials,
  EnvironmentWorkspace,
  FunctionalProfile,
  GoalWorkspace,
  InterventionWorkspace,
} from '../routes/clinical/Workspaces'
import {
  CareCoordination,
  CareTeamView,
  ClinicAppointments,
  ClinicalDocuments,
  ClinicalPermissions,
  ClinicalTasks,
  Referrals,
} from '../routes/clinical/Misc'

import {
  OrgAcademicSupport,
  OrgActive,
  OrgCommunication,
  OrgDashboard,
  OrgDocuments,
  OrgPeople,
  OrgRequestDetail,
  OrgRequests,
  OrgTasks,
} from '../routes/org/Org'
import {
  ClinicAccess,
  ClinicDashboard,
  ClinicPatientCoordination,
  ClinicPatients,
  ClinicPending,
} from '../routes/org/Clinic'
import {
  TrustedHome,
  TrustedObservation,
  TrustedPermissions,
  TrustedShared,
  TrustedSupport,
} from '../routes/trusted/Trusted'
import {
  AdminAccess,
  AdminAudit,
  AdminDashboard,
  AdminIntegrations,
  AdminUsers,
  AdminWorkflow,
  AdminWorkflows,
} from '../routes/admin/Admin'

/** Authentication is a backend concern; the frontend only reflects it. */
function RequireSession({ children }: { children: ReactNode }) {
  const { signedIn, role } = useSession()
  // Signing in resolves the person and their role together, so there is no
  // in-between state to land on any more.
  if (!signedIn || !role) return <Navigate to="/" replace />
  return <>{children}</>
}

/**
 * A destination that only exists for some people.
 *
 * Not a refusal — a refusal is a screen somebody reads, and these are not
 * things anyone should ever be reading. The administrator has no Ask because
 * there is nothing he may ask; the employer has no Sharing because it is not
 * his record to share. Reaching one of these by URL sends you to your own home
 * rather than telling you what you are missing.
 */
function Only({ when, children }: { when: boolean; children: ReactNode }) {
  const { role } = useSession()
  if (!when) return <Navigate to={homeFor(role)} replace />
  return <>{children}</>
}

/** The screens every clinical role shares, mounted under that role's base path. */
function clinicalRoutes() {
  return (
    <>
      <Route index element={<ClinicalDashboard />} />
      <Route path="patients" element={<ClinicalPatients />} />
      {/* One name, one destination. The tab is in the URL so a link can point
          at the part of the record it is about. */}
      <Route path="patients/:patientId" element={<PatientRecord />} />
      <Route path="patients/:patientId/:tab" element={<PatientRecord />} />
      <Route path="session" element={<SessionWorkspace />} />
      <Route path="memory" element={<MemoryReview />} />
      <Route path="strategies" element={<StrategyHistory />} />
      <Route path="strategies/:strategyId" element={<StrategyDetail />} />
      <Route path="outcomes" element={<OutcomesView />} />
      <Route path="documents" element={<ClinicalDocuments />} />
      <Route path="handover" element={<HandoverBuilder />} />
      <Route path="tasks" element={<ClinicalTasks />} />
      <Route path="permissions" element={<ClinicalPermissions />} />
      <Route path="timeline" element={<ClinicalTimeline />} />
      <Route path="appointments" element={<ClinicalAppointments />} />
      <Route path="calendar" element={<Calendar scope="mine" />} />
      <Route path="add" element={<AddInformation />} />
      <Route path="coordination" element={<CareCoordination />} />
      <Route path="referrals" element={<Referrals />} />
    </>
  )
}

export default function App() {
  const { signedIn, option, setupComplete, role } = useSession()
  const notAdmin = role !== 'admin'

  return (
    <Routes>
      {/* Where a signed-in person belongs is derived here rather than pushed
          from the sign-in handler. The handler's navigate raced this redirect
          and lost, which sent every first-time user straight past the
          introduction — the one screen that explains what ORCA will and will
          not do without asking. */}
      <Route
        path="/"
        element={
          signedIn && option ? (
            <Navigate to={setupComplete ? option.home : '/setup'} replace />
          ) : (
            <Login />
          )
        }
      />
      {/* Kept as a redirect rather than removed: an old bookmark or a
          half-remembered URL should land somewhere sensible, not on a dead end. */}
      <Route path="/role" element={<Navigate to="/" replace />} />
      <Route path="/setup" element={signedIn ? <Onboarding /> : <Navigate to="/" replace />} />

      {/* Added beside the product, not into it. A bare screen for finding out
          whether a Yoxa workflow works at all: no shell, no navigation, no
          dependency on anything else here. Signed-in only, because the whole
          point is that the trigger is built from a real session. */}
      <Route
        path="/chat"
        element={signedIn ? <WorkflowChat /> : <Navigate to="/" replace />}
      />

      {/*
        ORCA proper.

        Ask is the home screen for everyone except the administrator, and every
        other destination exists to support what happens in the conversation.
        The older role workspaces are still mounted below and still reachable by
        URL — nothing was deleted — but nothing links to them any more.
      */}
      <Route element={<Shell />}>
        {/*
          Ananya's only. Everybody else lands on the screen that is their work —
          a caseload, the open tasks, the requests waiting on them — and a
          summary screen for somebody who arrived to do one specific thing is a
          detour with a heading on it.
        */}
        <Route
          path="/home"
          element={
            <Only when={role === 'patient'}>
              <OrcaHome />
            </Only>
          }
        />
        <Route path="/ask" element={<Only when={notAdmin}><Ask /></Only>} />
        <Route path="/ask/:askId" element={<Only when={notAdmin}><Answer /></Only>} />
        <Route path="/record" element={<Only when={notAdmin}><OrcaRecord /></Only>} />
        <Route path="/record/:entryId" element={<Only when={notAdmin}><Entry /></Only>} />
        <Route path="/decisions" element={<Only when={notAdmin}><OrcaDecisions /></Only>} />
        <Route path="/documents" element={<Only when={notAdmin}><OrcaDocuments /></Only>} />
        <Route
          path="/sharing"
          element={
            <Only when={role === 'patient'}>
              <OrcaSharing />
            </Only>
          }
        />
        <Route
          path="/caseload"
          element={
            <Only when={hasCaseload(role)}>
              <OrcaCaseload />
            </Only>
          }
        />
        <Route path="/adjust" element={<OrcaAdjust />} />
        <Route
          path="/appointments"
          element={
            <Only when={notAdmin && role !== 'employer' && role !== 'university'}>
              <OrcaAppointments />
            </Only>
          }
        />
        <Route
          path="/register"
          element={
            <Only when={role === 'employer' || role === 'university'}>
              <OrcaRegister />
            </Only>
          }
        />
        <Route
          path="/requests"
          element={
            <Only when={role === 'employer' || role === 'university' || role === 'clinic'}>
              <OrcaRequests />
            </Only>
          }
        />
        {/*
          Not the employer or the university.

          Their nav has never offered Notes, but a route gated only on "not the
          administrator" is reachable by typing the URL — and an employer
          writing into somebody's clinical record is a role boundary this
          product should not leave to the navigation to enforce.
        */}
        <Route
          path="/notes"
          element={
            <Only when={notAdmin && role !== 'employer' && role !== 'university'}>
              <OrcaNotes />
            </Only>
          }
        />
        <Route path="/tasks" element={<Only when={hasCaseload(role)}><OrcaTasks /></Only>} />
        <Route
          path="/strategies"
          element={
            <Only when={role === 'ot' || role === 'therapist' || role === 'patient'}>
              <OrcaStrategies />
            </Only>
          }
        />
        <Route path="/runs" element={<Only when={role === 'admin'}><Runs /></Only>} />
        <Route path="/access" element={<Only when={role === 'admin'}><Access /></Only>} />
        <Route path="/incidents" element={<Only when={role === 'admin'}><Incidents /></Only>} />
        <Route path="/health" element={<Only when={role === 'admin'}><Health /></Only>} />
      </Route>

      <Route
        element={
          <RequireSession>
            <AppShell />
          </RequireSession>
        }
      >
        {/* ------------------------------------------------ patient experience */}
        <Route path="/patient">
          <Route index element={<PatientHome />} />
          <Route path="guide" element={<PatientGuide />} />
          <Route path="story" element={<PatientStory />} />
          <Route path="story/:eventId" element={<PatientStoryEvent />} />
          <Route path="profile" element={<PatientProfile />} />
          <Route path="support" element={<PatientSupport />} />
          <Route path="support/:strategyId" element={<PatientStrategy />} />
          <Route path="care" element={<PatientCare />} />
          <Route path="calendar" element={<Calendar />} />
          <Route path="care/team" element={<PatientCareTeam />} />
          <Route path="care/appointments/:appointmentId" element={<PatientAppointment />} />
          <Route path="care/appointments/:appointmentId/prepare" element={<PatientAppointmentPrep />} />
          <Route path="work" element={<PatientWork />} />
          <Route path="work/request" element={<PatientRequestBuilder />} />
          <Route path="work/disclosure/:requestId" element={<PatientDisclosureRoute />} />
          <Route path="documents" element={<PatientDocuments />} />
          <Route path="documents/upload" element={<PatientDocumentUpload />} />
          <Route path="documents/:documentId" element={<PatientDocument />} />
          <Route path="connections" element={<PatientConnections />} />
          <Route path="connections/:connectionId" element={<PatientConnection />} />
          <Route path="requests" element={<PatientRequests />} />
          <Route path="requests/:requestId" element={<PatientRequest />} />
          <Route path="progress" element={<PatientProgress />} />
          <Route path="privacy" element={<PatientPrivacy />} />
          <Route path="privacy/history" element={<PatientSharingHistory />} />
        </Route>

        {/* ------------------------------------------- professional experiences */}
        <Route path="/psychologist">{clinicalRoutes()}</Route>

        <Route path="/psychiatrist">
          {clinicalRoutes()}
          <Route path="clinical" element={<Navigate to="/psychiatrist/patients" replace />} />
        </Route>

        <Route path="/therapist">
          {clinicalRoutes()}
          <Route path="goals" element={<GoalWorkspace />} />
          <Route path="interventions" element={<InterventionWorkspace />} />
        </Route>

        <Route path="/ot">
          {clinicalRoutes()}
          <Route path="functional" element={<FunctionalProfile />} />
          <Route path="environment" element={<EnvironmentWorkspace />} />
          <Route path="trials" element={<AdaptationTrials />} />
        </Route>

        <Route path="/gp">
          {clinicalRoutes()}
          <Route path="summary" element={<Navigate to="/gp/patients" replace />} />
          <Route path="care-team" element={<CareTeamView />} />
        </Route>

        {/* ------------------------------------------ organisation experiences */}
        <Route path="/clinic">
          <Route index element={<ClinicDashboard />} />
          <Route path="add" element={<AddInformation />} />
          <Route path="patients" element={<ClinicPatients />} />
          <Route path="patients/:patientId" element={<PatientRecord />} />
          <Route path="patients/:patientId/:tab" element={<PatientRecord />} />
          <Route path="patients/:patientId/coordination" element={<ClinicPatientCoordination />} />
          <Route path="appointments" element={<ClinicAppointments />} />
          <Route path="coordination" element={<CareCoordination />} />
          <Route path="referrals" element={<Referrals />} />
          <Route path="documents" element={<ClinicalDocuments />} />
          <Route path="pending" element={<ClinicPending />} />
          <Route path="access" element={<ClinicAccess />} />
        </Route>

        <Route path="/employer">
          <Route index element={<OrgDashboard />} />
          <Route path="add" element={<AddInformation />} />
          {/* A name leads to the record, scoped to what this organisation may
              see — same destination as every other stakeholder gets. */}
          <Route path="patients/:patientId" element={<PatientRecord />} />
          <Route path="patients/:patientId/:tab" element={<PatientRecord />} />
          <Route path="employees" element={<OrgPeople />} />
          <Route path="requests" element={<OrgRequests />} />
          <Route path="requests/:requestId" element={<OrgRequestDetail />} />
          <Route path="active" element={<OrgActive />} />
          <Route path="tasks" element={<OrgTasks />} />
          <Route path="documents" element={<OrgDocuments />} />
          <Route path="communication" element={<OrgCommunication />} />
        </Route>

        <Route path="/university">
          <Route index element={<OrgDashboard />} />
          <Route path="add" element={<AddInformation />} />
          {/* A name leads to the record, scoped to what this organisation may
              see — same destination as every other stakeholder gets. */}
          <Route path="patients/:patientId" element={<PatientRecord />} />
          <Route path="patients/:patientId/:tab" element={<PatientRecord />} />
          <Route path="students" element={<OrgPeople />} />
          <Route path="requests" element={<OrgRequests />} />
          <Route path="requests/:requestId" element={<OrgRequestDetail />} />
          <Route path="active" element={<OrgActive />} />
          <Route path="support" element={<OrgAcademicSupport />} />
          <Route path="documents" element={<OrgDocuments />} />
          <Route path="tasks" element={<OrgTasks />} />
        </Route>

        {/* ------------------------------------------------- trusted person */}
        <Route path="/trusted">
          <Route index element={<TrustedHome />} />
          <Route path="add" element={<AddInformation />} />
          <Route path="shared" element={<TrustedShared />} />
          <Route path="support" element={<TrustedSupport />} />
          <Route path="observation" element={<TrustedObservation />} />
          <Route path="permissions" element={<TrustedPermissions />} />
        </Route>

        {/* -------------------------------------------------- administration */}
        <Route path="/admin">
          <Route index element={<AdminDashboard />} />
          <Route path="workflows" element={<AdminWorkflows />} />
          <Route path="workflows/:workflowId" element={<AdminWorkflow />} />
          <Route path="audit" element={<AdminAudit />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="access" element={<AdminAccess />} />
          <Route path="integrations" element={<AdminIntegrations />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to={option?.home ?? '/'} replace />} />
    </Routes>
  )
}
