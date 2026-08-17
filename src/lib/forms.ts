// What a submit action hands back when it did not submit.
//
// Success never returns: every franchisee submission ends in redirect() to the
// status page, which is the one screen a franchisee needs afterwards. So a
// returned value always means failure, and the shape is deliberately just a
// sentence — Next masks thrown error messages in production, and "something
// went wrong" is not an acceptable thing to tell someone who just filled in a
// form.

export interface SubmitFailure {
  error: string;
}
