import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import Hero from '@/components/public/Hero';
import HeroSwitch from '@/components/hero/HeroSwitch';
import type { Banner } from '@/lib/types';

// Mock next/dynamic for HeroSwitch variants
vi.mock('next/dynamic', () => ({
  default: () => {
    const Component = ({ banners, siteName, tagline }: any) => {
      if (banners.length === 0) {
        return (
          <div data-testid="hero-fallback" className="hero-fallback">
            <h1>{siteName}</h1>
            {tagline && <p>{tagline}</p>}
          </div>
        );
      }
      return (
        <section data-testid="hero-carousel" aria-label="Sorotan perpustakaan">
          <div data-testid="hero-banner">
            <h2>{banners[0].title}</h2>
            {banners[0].subtitle && <p>{banners[0].subtitle}</p>}
            <a href={banners[0].link}>Selengkapnya</a>
          </div>
          {banners.length > 1 && (
            <div data-testid="hero-nav">
              <button data-testid="hero-prev" aria-label="Banner sebelumnya">
                Prev
              </button>
              <button data-testid="hero-next" aria-label="Banner berikutnya">
                Next
              </button>
              <div role="tablist" data-testid="hero-indicators">
                {banners.map((b: Banner, i: number) => (
                  <button
                    key={b.id}
                    role="tab"
                    aria-selected={i === 0}
                    data-testid={`hero-indicator-${i}`}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      );
    };
    return Component;
  },
}));

// Mock the hero variants
vi.mock('@/components/hero/variants/CenteredHero', () => ({
  default: ({ banners, siteName, tagline }: any) => {
    if (banners.length === 0) {
      return (
        <div data-testid="hero-fallback">
          <h1>{siteName}</h1>
          {tagline && <p>{tagline}</p>}
        </div>
      );
    }
    return (
      <section data-testid="hero-carousel" aria-label="Sorotan perpustakaan">
        <div data-testid="hero-banner">
          <h2>{banners[0].title}</h2>
          {banners[0].subtitle && <p>{banners[0].subtitle}</p>}
          <a href={banners[0].link}>Selengkapnya</a>
        </div>
        {banners.length > 1 && (
          <div data-testid="hero-nav">
            <button data-testid="hero-prev" aria-label="Banner sebelumnya">
              Prev
            </button>
            <button data-testid="hero-next" aria-label="Banner berikutnya">
              Next
            </button>
            <div role="tablist" data-testid="hero-indicators">
              {banners.map((b: Banner, i: number) => (
                <button
                  key={b.id}
                  role="tab"
                  aria-selected={i === 0}
                  data-testid={`hero-indicator-${i}`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>
    );
  },
}));

const mockBanners: Banner[] = [
  {
    id: '1',
    title: 'Selamat Datang',
    subtitle: 'Perpustakaan Digital Terbaik',
    image_url: 'https://example.com/banner1.jpg',
    link: '/katalog',
    sort_order: 1,
  },
  {
    id: '2',
    title: 'Buku Baru',
    subtitle: 'Koleksi Terbaru Bulan Ini',
    image_url: 'https://example.com/banner2.jpg',
    link: '/katalog?new=true',
    sort_order: 2,
  },
];

describe('Hero (legacy wrapper)', () => {
  it('renders HeroSwitch with emerald-centered variant', () => {
    render(<Hero banners={mockBanners} siteName="PerpusTest" tagline="Tagline Test" />);

    // Should delegate to HeroSwitch which renders the carousel
    expect(screen.getByTestId('hero-carousel')).toBeInTheDocument();
    expect(screen.getByText('Selamat Datang')).toBeInTheDocument();
    expect(screen.getByText('Perpustakaan Digital Terbaik')).toBeInTheDocument();
  });

  it('shows fallback when no banners', () => {
    render(<Hero banners={[]} siteName="PerpusTest" tagline="Tagline Test" />);

    expect(screen.getByTestId('hero-fallback')).toBeInTheDocument();
    expect(screen.getByText('PerpusTest')).toBeInTheDocument();
    expect(screen.getByText('Tagline Test')).toBeInTheDocument();
  });
});

describe('HeroSwitch', () => {
  it('renders carousel with banners', () => {
    render(
      <HeroSwitch
        banners={mockBanners}
        siteName="PerpusTest"
        tagline="Tagline"
        variant="emerald-centered"
      />
    );

    expect(screen.getByTestId('hero-carousel')).toBeInTheDocument();
    expect(screen.getByText('Selamat Datang')).toBeInTheDocument();
    expect(screen.getByText('Perpustakaan Digital Terbaik')).toBeInTheDocument();
  });

  it('shows fallback when no banners', () => {
    render(
      <HeroSwitch banners={[]} siteName="PerpusTest" tagline="Tagline" variant="emerald-centered" />
    );

    expect(screen.getByTestId('hero-fallback')).toBeInTheDocument();
    expect(screen.getByText('PerpusTest')).toBeInTheDocument();
  });

  it('shows navigation controls when multiple banners', () => {
    render(
      <HeroSwitch
        banners={mockBanners}
        siteName="PerpusTest"
        tagline="Tagline"
        variant="emerald-centered"
      />
    );

    expect(screen.getByTestId('hero-nav')).toBeInTheDocument();
    expect(screen.getByTestId('hero-prev')).toBeInTheDocument();
    expect(screen.getByTestId('hero-next')).toBeInTheDocument();
    expect(screen.getByTestId('hero-indicators')).toBeInTheDocument();
    expect(screen.getByTestId('hero-indicator-0')).toBeInTheDocument();
    expect(screen.getByTestId('hero-indicator-1')).toBeInTheDocument();
  });

  it('has accessible carousel markup', () => {
    render(
      <HeroSwitch
        banners={mockBanners}
        siteName="PerpusTest"
        tagline="Tagline"
        variant="emerald-centered"
      />
    );

    const carousel = screen.getByTestId('hero-carousel');
    expect(carousel).toHaveAttribute('aria-label', 'Sorotan perpustakaan');
    expect(carousel).toHaveAttribute('aria-roledescription', 'carousel');
  });

  it('switches variant via variant prop', () => {
    const { rerender } = render(
      <HeroSwitch
        banners={mockBanners}
        siteName="PerpusTest"
        tagline="Tagline"
        variant="centered"
      />
    );
    expect(screen.getByTestId('hero-carousel')).toBeInTheDocument();

    rerender(
      <HeroSwitch
        banners={mockBanners}
        siteName="PerpusTest"
        tagline="Tagline"
        variant="editorial"
      />
    );
    expect(screen.getByTestId('hero-carousel')).toBeInTheDocument();
  });

  it('renders link with banner href', () => {
    render(
      <HeroSwitch
        banners={mockBanners}
        siteName="PerpusTest"
        tagline="Tagline"
        variant="emerald-centered"
      />
    );

    const link = screen.getByRole('link', { name: /selengkapnya/i });
    expect(link).toHaveAttribute('href', '/katalog');
  });

  it('shows subtitle when present', () => {
    render(
      <HeroSwitch
        banners={mockBanners}
        siteName="PerpusTest"
        tagline="Tagline"
        variant="emerald-centered"
      />
    );

    expect(screen.getByText('Perpustakaan Digital Terbaik')).toBeInTheDocument();
  });

  it('does not show subtitle when null', () => {
    const bannersWithoutSubtitle: Banner[] = [
      {
        id: '1',
        title: 'Selamat Datang',
        subtitle: null,
        image_url: 'https://example.com/banner1.jpg',
        link: '/katalog',
        sort_order: 1,
      },
    ];

    render(
      <HeroSwitch
        banners={bannersWithoutSubtitle}
        siteName="PerpusTest"
        tagline="Tagline"
        variant="emerald-centered"
      />
    );

    expect(screen.queryByText('Perpustakaan Digital Terbaik')).not.toBeInTheDocument();
  });
});
