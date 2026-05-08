import chairImage from "../assets/chair-item.svg";
import coffeeTableImage from "../assets/coffee-table-item.svg";
import sofaImage from "../assets/sofa-room-3x1.svg";

const furnitureItems = {
  chair: {
    id: "chair",
    name: "Chair",
    width: 1,
    height: 1,
    color: "#22c55e",
    image: chairImage,
    render: {
      anchor: "surface-center",
      scale: {
        x: 0.72,
        y: 1.05,
      },
      offset: {
        x: 0,
        y: 0,
      },
      shadow: {
        scale: 0.7,
      },
    },
  },
  table: {
    id: "table",
    name: "Coffee Table",
    width: 2,
    height: 2,
    color: "#c084fc",
    image: coffeeTableImage,
    render: {
      anchor: "surface-center",
      scale: {
        x: 0.92,
        y: 0.82,
      },
      offset: {
        x: 0,
        y: 0,
      },
      shadow: {
        scale: 0.86,
      },
    },
  },
  sofa: {
    id: "sofa",
    name: "Sofa",
    width: 3,
    height: 1,
    color: "#f97316",
    image: sofaImage,
    render: {
      anchor: "sprite-floor",
      scale: {
        x: 0.96,
        y: 1.18,
      },
      offset: {
        x: 0,
        y: 2,
      },
      shadow: {
        scale: 0.92,
      },
      lift: {
        scale: 0.4,
        offset: 0,
      },
    },
  },
};

export default furnitureItems;
