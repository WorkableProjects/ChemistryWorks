// Live monitor helpers: pure summary of the students who started a test. No DOM.
//
//   liveSummary(students) -> { started, submitted, idle, working }

export function liveSummary(students = []) {
  return {
    started: students.length,
    submitted: students.filter((s) => s.submitted).length,
    idle: students.filter((s) => !s.submitted && s.idle).length,
    working: students.filter((s) => !s.submitted && !s.idle).length,
  };
}
