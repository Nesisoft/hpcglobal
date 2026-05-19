import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import FormField from './FormField';

const MODULES = {
  toolbar: [
    [{ header: [2, 3, false] }],
    ['bold', 'italic', 'underline', 'blockquote'],
    [{ list: 'ordered' }, { list: 'bullet' }],
    ['link'],
    ['clean'],
  ],
};

/**
 * WYSIWYG rich text editor (Quill). Stores HTML.
 *
 * Props:
 *   label, hint, required
 *   value    – HTML string
 *   onChange – (html) => void
 */
export default function RichTextEditor({ label, hint, required, value, onChange }) {
  return (
    <FormField label={label} hint={hint} required={required}>
      <div className="rich-text-editor bg-white rounded-lg border border-purple-brand/15">
        <ReactQuill
          theme="snow"
          value={value || ''}
          onChange={onChange}
          modules={MODULES}
        />
      </div>
    </FormField>
  );
}
