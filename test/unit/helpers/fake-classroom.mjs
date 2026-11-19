// In-memory stand-in for the Classroom advanced service (v1) used by Code.gs:
//   Classroom.Courses.list(opt)
//   Classroom.Courses.Students.list(courseId, opt)
//   Classroom.Courses.CourseWork.{ create(resource, courseId), get(courseId, id), patch(resource, courseId, id, opt), remove(courseId, id) }
//   Classroom.Courses.CourseWork.StudentSubmissions.{ list(courseId, cwId, opt), patch(resource, courseId, cwId, id, opt) }
// Lists page through `pageSize` items with nextPageToken. patch applies only the fields named in opt.updateMask.
// Errors are injected with fc.inject(method, { message, code }, { times, when }).

const clone = (v) => JSON.parse(JSON.stringify(v));

export function makeFakeClassroom({ pageSize = 100 } = {}) {
  const fc = {
    pageSize,
    courses: [],
    students: {}, // courseId -> [{ userId, profile: { emailAddress, name: { fullName } } }]
    work: {}, // courseId -> [courseWork]
    subs: {}, // `${courseId}/${cwId}` -> [{ id, userId, draftGrade, assignedGrade }]
    calls: [], // [{ method, args }]
    injected: [],
    onPatch: null, // (submission, args) => void, called after a successful submission patch
    nextId: 1,
  };

  fc.addCourse = (course) => { fc.courses.push({ courseState: 'ACTIVE', section: '', room: '', ...course }); fc.students[course.id] ||= []; fc.work[course.id] ||= []; return course; };
  fc.addStudent = (courseId, email, name = '') => {
    const userId = `u${fc.nextId++}`;
    fc.students[courseId].push({ userId, profile: { ...(email ? { emailAddress: email } : {}), name: { fullName: name || email || 'No email' } } });
    return userId;
  };
  fc.userIdOf = (courseId, email) => (fc.students[courseId].find((s) => s.profile.emailAddress === email) || {}).userId;
  fc.submissionOf = (courseId, cwId, email) => (fc.subs[`${courseId}/${cwId}`] || []).find((s) => s.userId === fc.userIdOf(courseId, email));
  fc.workOf = (courseId, id) => (fc.work[courseId] || []).find((w) => w.id === id);
  fc.callsTo = (method) => fc.calls.filter((c) => c.method === method);
  fc.inject = (method, error, { times = Infinity, when = null } = {}) => { fc.injected.push({ method, error, times, when }); };
  fc.clearInjected = () => { fc.injected = []; };

  const check = (method, args) => {
    fc.calls.push({ method, args: clone(args) });
    for (const inj of fc.injected) {
      if (inj.method !== method || inj.times <= 0) continue;
      if (inj.when && !inj.when(args)) continue;
      inj.times -= 1;
      throw Object.assign(new Error(inj.error.message || 'Classroom error'), inj.error.code ? { code: inj.error.code } : {});
    }
  };
  const page = (items, opt, key) => {
    const start = opt && opt.pageToken ? Number(opt.pageToken) : 0;
    const out = { [key]: clone(items.slice(start, start + fc.pageSize)) };
    if (start + fc.pageSize < items.length) out.nextPageToken = String(start + fc.pageSize);
    return out;
  };
  const ensureSubmissions = (courseId, cw) => {
    const key = `${courseId}/${cw.id}`;
    fc.subs[key] ||= [];
    for (const st of fc.students[courseId] || []) {
      if (!fc.subs[key].some((s) => s.userId === st.userId)) fc.subs[key].push({ id: `sub${fc.nextId++}`, userId: st.userId, state: 'CREATED' });
    }
  };

  const CourseWork = {
    create(resource, courseId) {
      check('work.create', { resource, courseId });
      const cw = { id: `cw${fc.nextId++}`, courseId, state: 'PUBLISHED', ...clone(resource) };
      fc.work[courseId].push(cw);
      if (cw.state === 'PUBLISHED') ensureSubmissions(courseId, cw);
      return clone(cw);
    },
    get(courseId, id) {
      check('work.get', { courseId, id });
      const cw = fc.workOf(courseId, id);
      if (!cw) throw Object.assign(new Error('Requested entity was not found.'), { code: 404 });
      return clone(cw);
    },
    patch(resource, courseId, id, opt = {}) {
      check('work.patch', { resource, courseId, id, opt });
      const cw = fc.workOf(courseId, id);
      if (!cw) throw Object.assign(new Error('Requested entity was not found.'), { code: 404 });
      for (const k of String(opt.updateMask || '').split(',').filter(Boolean)) if (k in resource) cw[k] = clone(resource[k]);
      if (cw.state === 'PUBLISHED') ensureSubmissions(courseId, cw);
      return clone(cw);
    },
    remove(courseId, id) {
      check('work.remove', { courseId, id });
      const at = (fc.work[courseId] || []).findIndex((w) => w.id === id);
      if (at < 0) throw Object.assign(new Error('Requested entity was not found.'), { code: 404 });
      fc.work[courseId].splice(at, 1);
      delete fc.subs[`${courseId}/${id}`];
      return {};
    },
    StudentSubmissions: {
      list(courseId, cwId, opt = {}) {
        check('submissions.list', { courseId, cwId, opt });
        return page(fc.subs[`${courseId}/${cwId}`] || [], opt, 'studentSubmissions');
      },
      patch(resource, courseId, cwId, id, opt = {}) {
        check('submissions.patch', { resource, courseId, cwId, id, opt });
        const sub = (fc.subs[`${courseId}/${cwId}`] || []).find((s) => s.id === id);
        if (!sub) throw Object.assign(new Error('Requested entity was not found.'), { code: 404 });
        for (const k of String(opt.updateMask || '').split(',').filter(Boolean)) if (k in resource) sub[k] = resource[k];
        if (fc.onPatch) fc.onPatch(sub, { courseId, cwId, id, resource, opt });
        return clone(sub);
      },
    },
  };

  fc.service = {
    Courses: {
      list(opt = {}) {
        check('courses.list', { opt });
        const states = Array.isArray(opt.courseStates) ? opt.courseStates : opt.courseStates ? [opt.courseStates] : null;
        return page(fc.courses.filter((c) => !states || states.includes(c.courseState)), opt, 'courses');
      },
      Students: {
        list(courseId, opt = {}) {
          check('students.list', { courseId, opt });
          return page(fc.students[courseId] || [], opt, 'students');
        },
      },
      CourseWork,
    },
  };
  return fc;
}
