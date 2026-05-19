import { useRef, useState } from 'react';
import { Upload, X } from 'lucide-react';
import { adminApi } from '../../services/api';
import FormField from './FormField';

/**
 * Reusable Cloudinary image upload field.
 *
 * Props:
 *   label    – field label
 *   hint     – helper text
 *   value    – current image URL
 *   onChange – (url) => void, called with the uploaded Cloudinary URL (or '')
 *   folder   – optional Cloudinary subfolder (e.g. "blog", "events")
 */
export default function ImageUpload({ label = 'Image', hint, value, onChange, folder }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  async function handleFile(file) {
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('image', file);
      const { data } = await adminApi.uploadImage(fd, folder);
      onChange(data.url);
    } catch {
      setError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <FormField label={label} hint={hint} error={error}>
      <div className="flex items-start gap-3">
        {value ? (
          <div className="relative w-24 h-16 rounded overflow-hidden border border-purple-brand/15 flex-shrink-0">
            <img src={value} alt="" className="w-full h-full object-cover" />
          </div>
        ) : (
          <div className="w-24 h-16 rounded border-2 border-dashed border-purple-brand/20 flex items-center justify-center flex-shrink-0 bg-cream">
            <Upload size={16} className="text-ink/30" />
          </div>
        )}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="btn-outline text-xs px-3 py-1.5 disabled:opacity-50"
          >
            {uploading ? 'Uploading…' : <><Upload size={12} /> {value ? 'Change image' : 'Upload image'}</>}
          </button>
          {value && (
            <button
              type="button"
              onClick={() => onChange('')}
              className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1"
            >
              <X size={11} /> Remove
            </button>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleFile(e.target.files[0])}
          />
        </div>
      </div>
    </FormField>
  );
}
