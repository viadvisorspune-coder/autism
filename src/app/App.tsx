import { Navigate, Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'
import AppShell from './shell/AppShell'
import { useSession } from '../state/session'
import { FirstRun, Login, RoleSelect } from '../routes/auth/Auth'

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

import ClinicalDashboard from '../routes/clinical/Dashboard'
import {
  ClinicalAppointments,
  ClinicalPatientOverview,
  ClinicalPatients,
  ClinicalTimeline,
} from '../routes/clinical/Patients'
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
  if (!signedIn) return <Navigate to="/" replace />
  if (!role) return <Navigate to="/role" replace />
  return <>{children}</>
}

/** The screens every clinical role shares, mounted under that role's base path. */
function clinicalRoutes() {
  return (
    <>
      <Route index element={<ClinicalDashboard />} />
      <Route path="patients" element={<ClinicalPatients />} />
      <Route path="patients/:patientId" element={<ClinicalPatientOverview />} />
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
      <Route path="coordination" element={<CareCoordination />} />
      <Route path="referrals" element={<Referrals />} />
    </>
  )
}

export default function App() {
  const { signedIn, option } = useSession()

  return (
    <Routes>
      <Route path="/" element={signedIn ? <Navigate to="/role" replace /> : <Login />} />
      <Route path="/role" element={signedIn ? <RoleSelect /> : <Navigate to="/" replace />} />
      <Route path="/setup" element={signedIn ? <FirstRun /> : <Navigate to="/" replace />} />

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
          <Route path="clinical" element={<Navigate to="/psychiatrist/patients/pt-ananya" replace />} />
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
          <Route path="summary" element={<Navigate to="/gp/patients/pt-ananya" replace />} />
          <Route path="care-team" element={<CareTeamView />} />
        </Route>

        {/* ------------------------------------------ organisation experiences */}
        <Route path="/clinic">
          <Route index element={<ClinicDashboard />} />
          <Route path="patients" element={<ClinicPatients />} />
          <Route path="patients/:patientId" element={<ClinicPatientCoordination />} />
          <Route path="appointments" element={<ClinicAppointments />} />
          <Route path="coordination" element={<CareCoordination />} />
          <Route path="referrals" element={<Referrals />} />
          <Route path="documents" element={<ClinicalDocuments />} />
          <Route path="pending" element={<ClinicPending />} />
          <Route path="access" element={<ClinicAccess />} />
        </Route>

        <Route path="/employer">
          <Route index element={<OrgDashboard />} />
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
