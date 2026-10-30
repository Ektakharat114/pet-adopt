import { useEffect, useState } from "react";
import { PetImage } from "./PetCard.jsx";

/** Large photo with a strip of thumbnails. Falls back to the species placeholder when there are no photos. */
export default function Gallery({ pet }) {
  const photos = pet.photos?.length ? pet.photos : pet.image_url ? [pet.image_url] : [];
  const [index, setIndex] = useState(0);

  useEffect(() => setIndex(0), [pet.id]);

  const current = Math.min(index, Math.max(photos.length - 1, 0));
  return (
    <div className="gallery">
      <PetImage pet={pet} src={photos[current] ?? ""} large />
      {photos.length > 1 && (
        <div className="thumbs" role="group" aria-label={`Photos of ${pet.name}`}>
          {photos.map((url, i) => (
            <button
              key={url}
              type="button"
              className={`thumb ${i === current ? "active" : ""}`}
              aria-label={`Show photo ${i + 1} of ${photos.length}`}
              aria-current={i === current}
              onClick={() => setIndex(i)}
            >
              <img src={url} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
