const FIT_TOLERANCE: f64 = 0.5;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Placement {
    pub turned: bool,
    pub scale: f64,
    pub x: f64,
    pub y: f64,
}

pub fn upright_size(width: f64, height: f64, rotation: i64) -> (f64, f64) {
    let (width, height) = (width.abs(), height.abs());
    if rotation.rem_euclid(180) == 90 { (height, width) } else { (width, height) }
}

fn fits(width: f64, height: f64, paper: (f64, f64)) -> bool {
    width <= paper.0 + FIT_TOLERANCE && height <= paper.1 + FIT_TOLERANCE
}

pub fn place(page: (f64, f64), paper: (f64, f64), printable: Rect) -> Placement {
    let (width, height) = page;
    if fits(width, height, paper) {
        return Placement { turned: false, scale: 1.0, x: (paper.0 - width) / 2.0, y: (paper.1 - height) / 2.0 };
    }
    if fits(height, width, paper) {
        return Placement { turned: true, scale: 1.0, x: (paper.0 - height) / 2.0, y: (paper.1 - width) / 2.0 };
    }
    let upright = (printable.width / width).min(printable.height / height);
    let sideways = (printable.width / height).min(printable.height / width);
    let turned = sideways > upright;
    let scale = if turned { sideways } else { upright };
    let (across, down) = if turned { (height * scale, width * scale) } else { (width * scale, height * scale) };
    Placement { turned, scale, x: printable.x + (printable.width - across) / 2.0, y: printable.y + (printable.height - down) / 2.0 }
}

#[cfg(test)]
mod tests {
    use super::{Placement, Rect, place, upright_size};

    const LETTER: (f64, f64) = (612.0, 792.0);
    const BROTHER: Rect = Rect { x: 18.0, y: 40.0, width: 576.0, height: 734.0 };

    #[test]
    fn prints_a_page_that_fits_at_actual_size_centered_on_the_sheet() {
        assert_eq!(place(LETTER, LETTER, BROTHER), Placement { turned: false, scale: 1.0, x: 0.0, y: 0.0 });
        assert_eq!(place((500.0, 700.0), LETTER, BROTHER), Placement { turned: false, scale: 1.0, x: 56.0, y: 46.0 });
        assert_eq!(place((612.4, 792.3), LETTER, BROTHER).scale, 1.0);
    }

    #[test]
    fn turns_a_landscape_page_that_only_fits_sideways() {
        assert_eq!(place((792.0, 612.0), LETTER, BROTHER), Placement { turned: true, scale: 1.0, x: 0.0, y: 0.0 });
    }

    #[test]
    fn shrinks_a_page_too_big_for_the_sheet_into_the_printable_area() {
        let a4 = place((595.0, 842.0), LETTER, BROTHER);
        assert!(!a4.turned);
        assert!((a4.scale - 734.0 / 842.0).abs() < 1e-9);
        assert!((a4.x - (18.0 + (576.0 - 595.0 * a4.scale) / 2.0)).abs() < 1e-9);
        assert_eq!(a4.y, 40.0);
    }

    #[test]
    fn turns_a_page_when_that_shrinks_it_less() {
        let label = (288.0, 432.0);
        let printable = Rect { x: 0.0, y: 0.0, width: 288.0, height: 432.0 };
        let upright = place(LETTER, label, printable);
        assert!(!upright.turned);
        assert!((upright.scale - 288.0 / 612.0).abs() < 1e-9);
        let tabloid = place((1224.0, 792.0), LETTER, BROTHER);
        assert!(tabloid.turned);
        assert!((tabloid.scale - 734.0 / 1224.0).abs() < 1e-9);
    }

    #[test]
    fn measures_pages_the_way_they_are_shown() {
        assert_eq!(upright_size(612.0, 792.0, 0), (612.0, 792.0));
        assert_eq!(upright_size(612.0, 792.0, 90), (792.0, 612.0));
        assert_eq!(upright_size(612.0, 792.0, -90), (792.0, 612.0));
        assert_eq!(upright_size(612.0, 792.0, 180), (612.0, 792.0));
        assert_eq!(upright_size(-612.0, 792.0, 270), (792.0, 612.0));
    }
}
