import { useParams } from 'react-router-dom';
import SectionHero from '../../components/ui/SectionHero';
export default function BlogPost() {
  return (
    <>
      <SectionHero title="Blog Post" breadcrumb="Home / Blog" />
      <section className="section-pad bg-cream container-page text-center text-ink/50 font-body">Coming soon.</section>
    </>
  );
}
