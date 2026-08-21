import React, { useState } from "react";
import { Link } from '../router-compat';
import "../styles/HomePage.css"; // Import CSS for styling
import { APP_VERSION } from "../AppShell";
import TrackingService from "../services/trackingService";
import { useEffect } from "react";

function HomePage() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [expandedFaqs, setExpandedFaqs] = useState({});
  const [liveCount, setLiveCount] = useState(0);

  useEffect(() => {
    // Subscribe to live user count
    const unsubscribe = TrackingService.subscribeToLiveCount((count) => {
      setLiveCount(count);
    });

    return () => unsubscribe();
  }, []);

  return (
    <div className="homepage-container">
      {/* Header Section */}
      <header className="homepage-header">
        <div className="logo-container">
          <img
            src="/SEED_Logo.png"
            alt="SEED-IT Logo"
            className="logo"
          />
        </div>

        {/* Mobile Menu Button */}
        <button
          className="mobile-menu-btn"
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          aria-label="Toggle menu"
        >
          <span></span>
          <span></span>
          <span></span>
        </button>

        <nav className={`homepage-nav ${isMenuOpen ? 'active' : ''}`}>
          <a href="#about"
            className="nav-link"
            onClick={(e) => {
              e.preventDefault();
              setIsMenuOpen(false);
              document.getElementById('about').scrollIntoView({ behavior: 'smooth' });
            }}
          >About</a>
          <a href="#courses"
            className="nav-link"
            onClick={(e) => {
              e.preventDefault();
              setIsMenuOpen(false);
              document.querySelector('.seed-courses-section').scrollIntoView({ behavior: 'smooth' });
            }}
          >Courses</a>
          <a href="#testimonials"
            className="nav-link"
            onClick={(e) => {
              e.preventDefault();
              setIsMenuOpen(false);
              document.getElementById('testimonials').scrollIntoView({ behavior: 'smooth' });
            }}
          >Success Stories</a>
          <a href="#schedule"
            className="nav-link"
            onClick={(e) => {
              e.preventDefault();
              setIsMenuOpen(false);
              document.getElementById('schedule').scrollIntoView({ behavior: 'smooth' });
            }}
          >Schedule</a>
          <a href="#news"
            className="nav-link"
            onClick={(e) => {
              e.preventDefault();
              setIsMenuOpen(false);
              document.getElementById('news').scrollIntoView({ behavior: 'smooth' });
            }}
          >News</a>
          <a href="#contact"
            className="nav-link"
            onClick={(e) => {
              e.preventDefault();
              setIsMenuOpen(false);
              document.querySelector('.homepage-footer').scrollIntoView({ behavior: 'smooth' });
            }}
          >Contact</a>

          {/* Update Login and Register buttons with new classes */}
          <Link
            to="/login"
            className="nav-link header-btn header-btn-primary"
            onClick={() => setIsMenuOpen(false)}
          >
            Login Now
          </Link>
          <Link
            to="/register"
            className="nav-link header-btn header-btn-outline"
            onClick={() => setIsMenuOpen(false)}
          >
            Register
          </Link>
        </nav>
      </header>

      {/* Overlay for mobile menu */}
      {isMenuOpen && (
        <div
          className="mobile-menu-overlay"
          onClick={() => setIsMenuOpen(false)}
        />
      )}

      {/* Banner Section */}
      <section className="seed-banner-section" data-rocket-lazy-bg-b4df35fb-36d2-43b0-bcfb-7da6d9b2415c="excluded">
        <div className="seed-container-fluid">
          <div className="seed-row">
            <div className="seed-col-left">
              <div className="seed-banner-content">
                <p>Get trained by Industry Experts via</p>
                <h2>Instructor-led Live Online or Classroom Training</h2>
                <h2>Student and Staff Login</h2>
                <p>Access your personalized dashboard and learning resources:</p>
                <div className="seed-btn-section">
                  <Link to="/login" className="seed-orange-btn">
                    Login Now
                  </Link>
                  <Link to="/register" className="seed-outline-btn">
                    Register
                  </Link>
                </div>
              </div>
            </div>
            <div className="seed-col-right">
              <div className="seed-banner-image">
                <img
                  src="https://raw.githubusercontent.com/seeditDev/SEED-Website/316d3a1cd2ccf88284d13a46429758acd77ea06f/Plugins/main-banner-seed-it.webp"
                  alt="SEED IT"
                  width="100%"
                  height="100%"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats and About Section */}
      <section className="seed-stats-section" id="about">
        <div className="seed-stats-container">
          <div className="seed-stats-details">
            <div className="seed-stats-row">
              <div className="seed-stats-col">
                <div className="seed-stats-icon-box">
                  <div className="seed-stats-icon">
                    <img
                      src="https://i.ibb.co/bj0CNNWc/students-icon.webp"
                      alt="SEED IT Students"
                      width="100%"
                      height="100%"
                    />
                  </div>
                  <div className="seed-stats-content">
                    <h2>8000+</h2>
                    <p>Alumni</p>
                  </div>
                </div>
              </div>
              <div className="seed-stats-col">
                <div className="seed-stats-icon-box">
                  <div className="seed-stats-icon">
                    <img
                      src="https://i.ibb.co/99r1TBHy/course-icon.webp"
                      alt="SEED IT Courses"
                      width="100%"
                      height="100%"
                    />
                  </div>
                  <div className="seed-stats-content">
                    <h2>40+</h2>
                    <p>Courses</p>
                  </div>
                </div>
              </div>
              <div className="seed-stats-col">
                <div className="seed-stats-icon-box">
                  <div className="seed-stats-icon">
                    <img
                      src="https://i.ibb.co/gLKwL4mb/trainers-icon.webp"
                      alt="SEED IT Trainers"
                      width="100%"
                      height="100%"
                    />
                  </div>
                  <div className="seed-stats-content">
                    <h2>100+</h2>
                    <p>Expert IT Trainers</p>
                  </div>
                </div>
              </div>
              <div className="seed-stats-col">
                <div className="seed-stats-icon-box live-stats-box">
                  <div className="seed-stats-icon">
                    <img
                      src="https://i.ibb.co/cKgNqmnq/users-live.png"
                      alt="SEED IT Live Users"
                      width="100%"
                      height="100%"
                    />
                  </div>
                  <div className="seed-stats-content">
                    <div className="live-indicator">
                      <span className="live-dot"></span>
                      LIVE
                    </div>
                    <h2>{liveCount}</h2>
                    <p>Users Online</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="seed-about-content">
            <h1>SEED Innovating Technologies and Educational Services (SEED-IT)</h1>
            <p>SEED Innovating Technologies and Educational Services (SEED-IT) is a leading Training and Placement company managed by IT veterans with more than a decade of experience in leading MNC companies. We are spread across cities like Coimbatore, Tiruppur, Bangalore, Chennai, Hyderabad, Vizag and Kochi. We are known for our practical approach towards training that enables students to gain real-time exposure on competitive technologies. Training is offered by employees from MNCs to give real corporate exposure to the students.</p>

            <h2>Why SEED IT is the Best Training Institute in Coimbatore?</h2>
            <ul className="seed-features-list">
              <li>Helped more than 50,000+ students and professionals to start & shift their Career into IT</li>
              <li>We enroll only 30-60 students per batch so that individual attention to each and every student is guaranteed</li>
              <li>We have placement tie-up with more than 300+ companies. Our Placement team works tirelessly to help you get your dream IT job!</li>
              <li>Trainers from leading IT companies to provide an in-depth and practical training with real-time projects</li>
              <li>Unlimited Lab Usage.</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="seed-features-section">
        <div className="seed-features-container">
          <h3>Features</h3>
          <div className="seed-features-row">
            <div className="seed-feature-col">
              <div className="seed-feature-box">
                <div>
                  <h3>Real-Time Experts as Trainers</h3>
                  <p>At SEED IT, you will learn from industry experts eager to share their knowledge with learners. You will also get personally mentored by the Experts.</p>
                </div>
              </div>
            </div>

            <div className="seed-feature-col">
              <div className="seed-feature-box">
                <div>
                  <h3>LIVE Project</h3>
                  <p>Get the opportunity to work on real-time projects that will provide you with deep experience. Showcase your project experience and increase your chances of getting hired!</p>
                </div>
              </div>
            </div>

            <div className="seed-feature-col">
              <div className="seed-feature-box">
                <div>
                  <h3>Certification</h3>
                  <p>SEED IT offers certification. Also, get ready to clear global certifications. 90% of SEED IT students appear for global certifications and 100% of them clear it.</p>
                </div>
              </div>
            </div>

            <div className="seed-feature-col">
              <div className="seed-feature-box">
                <div>
                  <h3>Affordable Fees</h3>
                  <p>At SEED IT, the course fee is not only affordable, but you can also pay it in installments. Quality training at an affordable price is our motto.</p>
                </div>
              </div>
            </div>

            <div className="seed-feature-col">
              <div className="seed-feature-box">
                <div>
                  <h3>Flexibility</h3>
                  <p>At SEED IT, you get the ultimate flexibility. Classroom or online training? Early morning or late evening? Weekday or weekend? Regular Pace or Fast Track? - Choose whatever suits you best.</p>
                </div>
              </div>
            </div>

            <div className="seed-feature-col">
              <div className="seed-feature-box">
                <div>
                  <h3>Placement Support</h3>
                  <p>Tied-up & signed MOUs with over 300+ small & medium-sized companies to support you with opportunities to kick-start & advance your career.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Accreditation Section */}
      <section className="seed-accreditation-section">
        <div className="seed-accreditation-container">
          <h3>Accreditations</h3>
          <div className="seed-accreditation-content">
            <div className="seed-accreditation-row">
              <div className="seed-accreditation-col">
                <div className="seed-accreditation-img">
                  <img
                    width="140"
                    height="96"
                    src="https://i.ibb.co/4wkDt1X9/iso-logo.webp"
                    alt="ISO Certification"
                  />
                </div>
              </div>

              <div className="seed-accreditation-col">
                <div className="seed-accreditation-img">
                  <img
                    width="140"
                    height="96"
                    src="https://i.ibb.co/jsXzX3X/istqb.webp"
                    alt="ISTQB Certification"
                  />
                </div>
              </div>

              <div className="seed-accreditation-col">
                <div className="seed-accreditation-img">
                  <img
                    width="140"
                    height="96"
                    src="https://i.ibb.co/8nHQNSqC/bc.webp"
                    alt="British Council Certification"
                  />
                </div>
              </div>

              <div className="seed-accreditation-col">
                <div className="seed-accreditation-img">
                  <img
                    width="140"
                    height="96"
                    src="https://i.ibb.co/1JsXQNvy/microsoft-logo.webp"
                    alt="Microsoft Certification"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Companies Section */}
      <section className="seed-companies-section">
        <div className="seed-companies-container">
          <h3>Our Students Work at</h3>
          <div className="seed-companies-grid">
            <div className="seed-company-item">
              <img
                src="https://i.ibb.co/M5jMzPP2/tcs.png"
                alt="TCS"
              />
            </div>
            <div className="seed-company-item">
              <img
                src="https://i.ibb.co/fd86LyBc/infosys.png"
                alt="Infosys"
              />
            </div>
            <div className="seed-company-item">
              <img
                src="https://i.ibb.co/C54XbrpD/wipro.png"
                alt="Wipro"
              />
            </div>
            <div className="seed-company-item">
              <img
                src="https://i.ibb.co/C3bdWcY4/cognizant.png"
                alt="Cognizant"
              />
            </div>
            <div className="seed-company-item">
              <img
                src="https://i.ibb.co/ks32DXxc/accenture.png"
                alt="Accenture"
              />
            </div>
            <div className="seed-company-item">
              <img
                src="https://i.ibb.co/bRPgdrwq/hcl.png"
                alt="HCL"
              />
            </div>
            <div className="seed-company-item">
              <img
                src="https://i.ibb.co/4rF75sN/capgemini.png"
                alt="Capgemini"
              />
            </div>
            <div className="seed-company-item">
              <img
                src="https://i.ibb.co/PGXNxWj7/ibm.png"
                alt="IBM"
              />
            </div>
            <div className="seed-company-item">
              <img
                src="https://i.ibb.co/r2GL4Prx/deloitte.png"
                alt="Deloitte"
              />
            </div>
            <div className="seed-company-item">
              <img
                src="https://i.ibb.co/cSqhYGx4/oracle.png"
                alt="Oracle"
              />
            </div>
            <div className="seed-company-item">
              <img
                src="https://i.ibb.co/p65qWjmd/amazon.png"
                alt="Amazon"
              />
            </div>
            <div className="seed-company-item">
              <img
                src="https://i.ibb.co/B5jtb10j/microsoft.png"
                alt="Microsoft"
              />
            </div>
            <div className="seed-company-item">
              <img
                src="https://i.ibb.co/ycXbCfQY/google.png"
                alt="Google"
              />
            </div>
            <div className="seed-company-item">
              <img
                src="https://i.ibb.co/DgHvmYQ6/dell.png"
                alt="Dell"
              />
            </div>
            <div className="seed-company-item">
              <img
                src="https://i.ibb.co/DDMdHwwj/hp.png"
                alt="HP"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Popular Courses Section */}
      <section className="seed-courses-section">
        <div className="seed-courses-container">
          <h2>Popular Courses</h2>
          <button
            className="seed-nav-button seed-nav-prev"
            onClick={() => {
              const container = document.querySelector('.seed-courses-grid');
              container.scrollBy({ left: -320, behavior: 'smooth' });
            }}
          >
            &#8249;
          </button>
          <button
            className="seed-nav-button seed-nav-next"
            onClick={() => {
              const container = document.querySelector('.seed-courses-grid');
              container.scrollBy({ left: 320, behavior: 'smooth' });
            }}
          >
            &#8250;
          </button>
          <div className="seed-courses-grid">
            <div className="seed-course-box">
              <h3> Data Structures & Algorithms</h3>
              <p>Master DSA with hands-on problems.</p>
              <button
                className="seed-course-button"
                onClick={() => {
                  setSelectedCourse({
                    title: "Data Structures & Algorithms",
                    description: "Master DSA with hands-on problems and real-world applications. Learn essential algorithms and data structures used in modern software development.",
                    duration: "4 months",
                    topics: [
                      "Arrays, Strings & Matrix Problems",
                      "Linked Lists & Dynamic Memory",
                      "Stacks, Queues & Hash Tables",
                      "Trees, BST & AVL Trees",
                      "Graphs & Graph Algorithms",
                      "Dynamic Programming & Greedy",
                      "Searching & Sorting Algorithms",
                      "Backtracking & Recursion",
                      "Time & Space Complexity Analysis",
                      "Interview Problem Solving"
                    ],
                    prerequisites: "Basic programming knowledge in any language",
                    price: "₹25,000"
                  });
                  setIsModalOpen(true);
                }}
              >
                View Course
              </button>
            </div>
            <div className="seed-course-box">
              <h3> Full Stack Web Development</h3>
              <p>Learn MERN stack from scratch.</p>
              <button
                className="seed-course-button"
                onClick={() => {
                  setSelectedCourse({
                    title: "Full Stack Web Development",
                    description: "Comprehensive MERN stack development course covering frontend, backend, and database management.",
                    duration: "6 months",
                    topics: [
                      "HTML5, CSS3 & Modern Layouts",
                      "JavaScript ES6+ & DOM Manipulation",
                      "React.js & Redux State Management",
                      "Node.js & Express.js Backend",
                      "MongoDB & Mongoose ODM",
                      "RESTful API Development",
                      "JWT Authentication & Security",
                      "React Hooks & Custom Hooks",
                      "Responsive Design & Bootstrap",
                      "Git Version Control & Deployment"
                    ],
                    prerequisites: "Basic computer knowledge",
                    price: "₹35,000"
                  });
                  setIsModalOpen(true);
                }}
              >
                View Course
              </button>
            </div>
            <div className="seed-course-box">
              <h3> Machine Learning & AI</h3>
              <p>Understand ML models and deep learning.</p>
              <button
                className="seed-course-button"
                onClick={() => {
                  setSelectedCourse({
                    title: "Machine Learning & AI",
                    description: "Comprehensive course on Machine Learning algorithms, Deep Learning, and AI applications.",
                    duration: "5 months",
                    topics: [
                      "Python & NumPy for ML",
                      "Data Preprocessing & Pandas",
                      "Supervised Learning Algorithms",
                      "Unsupervised Learning & Clustering",
                      "Deep Neural Networks & PyTorch",
                      "Convolutional Neural Networks",
                      "Natural Language Processing",
                      "Computer Vision & OpenCV",
                      "Reinforcement Learning Basics",
                      "ML Model Deployment & MLOps"
                    ],
                    prerequisites: "Python programming, Basic statistics",
                    price: "₹40,000"
                  });
                  setIsModalOpen(true);
                }}
              >
                View Course
              </button>
            </div>
            <div className="seed-course-box">
              <h3> SQL & Database Management</h3>
              <p>Master SQL for data-driven applications.</p>
              <button
                className="seed-course-button"
                onClick={() => {
                  setSelectedCourse({
                    title: "SQL & Database Management",
                    description: "Learn database design, SQL queries, and database management systems.",
                    duration: "3 months",
                    topics: [
                      "Database Design & Normalization",
                      "SQL Fundamentals & CRUD",
                      "Advanced Queries & Joins",
                      "Stored Procedures & Functions",
                      "Indexing & Query Optimization",
                      "Transaction Management & ACID",
                      "Database Security & Backup",
                      "NoSQL Databases Introduction",
                      "Data Warehousing Concepts",
                      "ETL Processes & Data Migration"
                    ],
                    prerequisites: "None",
                    price: "₹20,000"
                  });
                  setIsModalOpen(true);
                }}
              >
                View Course
              </button>
            </div>
            <div className="seed-course-box">
              <h3> DevOps & Cloud Computing</h3>
              <p>Master modern DevOps practices and cloud platforms.</p>
              <button
                className="seed-course-button"
                onClick={() => {
                  setSelectedCourse({
                    title: "DevOps & Cloud Computing",
                    description: "Comprehensive course covering DevOps practices, cloud platforms, and infrastructure automation.",
                    duration: "5 months",
                    topics: [
                      "Linux Administration & Shell Scripting",
                      "Docker & Container Orchestration",
                      "Kubernetes & Microservices",
                      "AWS Cloud Services & Architecture",
                      "Azure & Multi-cloud Strategy",
                      "CI/CD Pipeline Implementation",
                      "Infrastructure as Code (Terraform)",
                      "Monitoring & Logging (ELK Stack)",
                      "Cloud Security & Compliance",
                      "DevOps Best Practices & Tools"
                    ],
                    prerequisites: "Basic understanding of operating systems",
                    price: "₹45,000"
                  });
                  setIsModalOpen(true);
                }}
              >
                View Course
              </button>
            </div>
            <div className="seed-course-box">
              <h3> Cybersecurity & Ethical Hacking</h3>
              <p>Learn advanced security techniques and penetration testing.</p>
              <button
                className="seed-course-button"
                onClick={() => {
                  setSelectedCourse({
                    title: "Cybersecurity & Ethical Hacking",
                    description: "Comprehensive cybersecurity course covering offensive and defensive security techniques.",
                    duration: "6 months",
                    topics: [
                      "Network Security Fundamentals",
                      "Web Application Security",
                      "Penetration Testing Methodology",
                      "Malware Analysis & Reverse Engineering",
                      "Cryptography & Encryption",
                      "Security Tools & Frameworks",
                      "Incident Response & Forensics",
                      "Cloud Security & DevSecOps",
                      "Mobile Application Security",
                      "Security Compliance & Standards"
                    ],
                    prerequisites: "Basic networking knowledge",
                    price: "₹50,000"
                  });
                  setIsModalOpen(true);
                }}
              >
                View Course
              </button>
            </div>
            <div className="seed-course-box">
              <h3> Mobile App Development</h3>
              <p>Build cross-platform mobile applications.</p>
              <button
                className="seed-course-button"
                onClick={() => {
                  setSelectedCourse({
                    title: "Mobile App Development",
                    description: "Learn to build professional mobile applications for iOS and Android platforms.",
                    duration: "4 months",
                    topics: [
                      "React Native Fundamentals",
                      "Native iOS Development (Swift)",
                      "Native Android Development (Kotlin)",
                      "Cross-platform Development",
                      "UI/UX Design Principles",
                      "State Management & Redux",
                      "API Integration & Networking",
                      "Mobile App Security",
                      "App Store Deployment",
                      "Performance Optimization"
                    ],
                    prerequisites: "Basic JavaScript knowledge",
                    price: "₹35,000"
                  });
                  setIsModalOpen(true);
                }}
              >
                View Course
              </button>
            </div>
            <div className="seed-course-box">
              <h3> Game Development</h3>
              <p>Create engaging games with modern engines.</p>
              <button
                className="seed-course-button"
                onClick={() => {
                  setSelectedCourse({
                    title: "Game Development",
                    description: "Learn game development using Unity and Unreal Engine with industry-standard practices.",
                    duration: "6 months",
                    topics: [
                      "Unity Engine Fundamentals",
                      "C# Programming for Games",
                      "3D Modeling & Animation",
                      "Game Physics & Mechanics",
                      "Character & Level Design",
                      "Game UI/UX Design",
                      "Multiplayer Game Development",
                      "Game AI & Behavior Trees",
                      "Sound Design & Integration",
                      "Game Optimization & Publishing"
                    ],
                    prerequisites: "Basic programming knowledge",
                    price: "₹45,000"
                  });
                  setIsModalOpen(true);
                }}
              >
                View Course
              </button>
            </div>
          </div>
        </div>

        {/* Course Details Modal */}
        {isModalOpen && selectedCourse && (
          <div className="seed-modal-overlay" onClick={() => setIsModalOpen(false)}>
            <div className="seed-modal-content" onClick={e => e.stopPropagation()}>
              <button className="seed-modal-close" onClick={() => setIsModalOpen(false)}>×</button>
              <div className="seed-modal-header">
                <h2>{selectedCourse.title}</h2>
                <span className="seed-modal-price">{selectedCourse.price}</span>
              </div>
              <div className="seed-modal-body">
                <p className="seed-modal-description">{selectedCourse.description}</p>
                <div className="seed-modal-details">
                  <div className="seed-modal-detail-item">
                    <h4>Duration</h4>
                    <p>{selectedCourse.duration}</p>
                  </div>
                  <div className="seed-modal-detail-item">
                    <h4>Prerequisites</h4>
                    <p>{selectedCourse.prerequisites}</p>
                  </div>
                </div>
                <div className="seed-modal-topics">
                  <h4>What you'll learn</h4>
                  <ul>
                    {selectedCourse.topics.map((topic, index) => (
                      <li key={index}>{topic}</li>
                    ))}
                  </ul>
                </div>
                <button className="seed-modal-enroll">Enroll Now</button>
              </div>
            </div>
          </div>
        )}
      </section>


      {/* Student Success Stories Section */}
      <section className="seed-testimonials-section" id="testimonials">
        <div className="seed-container">
          <h2>Student Success Stories</h2>
          <div className="seed-testimonials-grid">
            <div className="seed-testimonial-card">
              <div className="seed-testimonial-content">
                <p>"The practical approach and industry-expert trainers helped me secure a position at TCS. Highly recommended!"</p>
                <h4>Priya S.</h4>
                <p className="seed-designation">Software Engineer at TCS</p>
              </div>
            </div>
            <div className="seed-testimonial-card">
              <div className="seed-testimonial-content">
                <p>"SEED IT's Full Stack course was comprehensive and up-to-date with industry standards. Got placed in Infosys!"</p>
                <h4>Rahul M.</h4>
                <p className="seed-designation">Full Stack Developer at Infosys</p>
              </div>
            </div>
            <div className="seed-testimonial-card">
              <div className="seed-testimonial-content">
                <p>"The DevOps course helped me transition from a developer to a DevOps engineer. Great learning experience!"</p>
                <h4>Arun K.</h4>
                <p className="seed-designation">DevOps Engineer at HCL</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Upcoming Batches Section */}
      <section className="seed-schedule-section" id="schedule">
        <div className="seed-container">
          <h2>Upcoming Batches</h2>
          <div className="seed-schedule-grid">
            <div className="seed-schedule-card">
              <h3>Full Stack Development</h3>
              <ul>
                <li>Weekday Batch: June 15, 2025</li>
                <li>Weekend Batch: June 20, 2025</li>
                <li>Time: 9:00 AM - 1:00 PM</li>
                <li>Mode: Online & Offline</li>
              </ul>
            </div>
            <div className="seed-schedule-card">
              <h3>Data Science & ML</h3>
              <ul>
                <li>Weekday Batch: June 18, 2025</li>
                <li>Weekend Batch: June 22, 2025</li>
                <li>Time: 2:00 PM - 6:00 PM</li>
                <li>Mode: Online & Offline</li>
              </ul>
            </div>
            <div className="seed-schedule-card">
              <h3>DevOps & Cloud</h3>
              <ul>
                <li>Weekday Batch: June 25, 2025</li>
                <li>Weekend Batch: June 29, 2025</li>
                <li>Time: 10:00 AM - 2:00 PM</li>
                <li>Mode: Online & Offline</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* News & Events Section */}
      <section className="seed-news-section" id="news">
        <div className="seed-container">
          <h2>Latest News & Events</h2>
          <div className="seed-news-grid">
            <div className="seed-news-card">
              <h3>Placement Drive</h3>
              <p>Upcoming placement drive with top MNCs on July 1st, 2025</p>
              <a href="#" className="seed-read-more">Read More</a>
            </div>
            <div className="seed-news-card">
              <h3>Free Workshop</h3>
              <p>Join our free workshop on Cloud Computing basics on June 10th, 2025</p>
              <a href="#" className="seed-read-more">Read More</a>
            </div>
            <div className="seed-news-card">
              <h3>New Course Launch</h3>
              <p>Launching Advanced Cybersecurity course with industry certification</p>
              <a href="#" className="seed-read-more">Read More</a>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="seed-faq-section" id="faq">
        <div className="seed-container">
          <h2>Frequently Asked Questions</h2>
          <div className="seed-faq-grid">
            <div className="seed-faq-item" onClick={() => setExpandedFaqs(prev => ({ ...prev, 1: !prev[1] }))}>
              <div className="seed-faq-header">
                <h3>What are the payment options available?</h3>
                <span className={`seed-faq-arrow ${expandedFaqs[1] ? 'expanded' : ''}`}>▼</span>
              </div>
              {expandedFaqs[1] && (
                <p>We offer flexible payment options including EMI, full payment, and installment-based payments. We accept all major payment methods.</p>
              )}
            </div>

            <div className="seed-faq-item" onClick={() => setExpandedFaqs(prev => ({ ...prev, 2: !prev[2] }))}>
              <div className="seed-faq-header">
                <h3>Do you provide placement assistance?</h3>
                <span className={`seed-faq-arrow ${expandedFaqs[2] ? 'expanded' : ''}`}>▼</span>
              </div>
              {expandedFaqs[2] && (
                <p>Yes, we provide 100% placement assistance with our network of 300+ hiring partners and dedicated placement team.</p>
              )}
            </div>

            <div className="seed-faq-item" onClick={() => setExpandedFaqs(prev => ({ ...prev, 3: !prev[3] }))}>
              <div className="seed-faq-header">
                <h3>What is the course duration?</h3>
                <span className={`seed-faq-arrow ${expandedFaqs[3] ? 'expanded' : ''}`}>▼</span>
              </div>
              {expandedFaqs[3] && (
                <p>Course duration varies from 3-6 months based on the program. We offer both fast-track and regular pace options.</p>
              )}
            </div>

            <div className="seed-faq-item" onClick={() => setExpandedFaqs(prev => ({ ...prev, 4: !prev[4] }))}>
              <div className="seed-faq-header">
                <h3>Is there a demo class available?</h3>
                <span className={`seed-faq-arrow ${expandedFaqs[4] ? 'expanded' : ''}`}>▼</span>
              </div>
              {expandedFaqs[4] && (
                <p>Yes, we offer a free demo class for all our courses to help you understand our teaching methodology.</p>
              )}
            </div>

            <div className="seed-faq-item" onClick={() => setExpandedFaqs(prev => ({ ...prev, 5: !prev[5] }))}>
              <div className="seed-faq-header">
                <h3>What is the class size for each batch?</h3>
                <span className={`seed-faq-arrow ${expandedFaqs[5] ? 'expanded' : ''}`}>▼</span>
              </div>
              {expandedFaqs[5] && (
                <p>We maintain small batch sizes of 30-60 students to ensure individual attention and better learning outcomes.</p>
              )}
            </div>

            <div className="seed-faq-item" onClick={() => setExpandedFaqs(prev => ({ ...prev, 6: !prev[6] }))}>
              <div className="seed-faq-header">
                <h3>Are the courses available online?</h3>
                <span className={`seed-faq-arrow ${expandedFaqs[6] ? 'expanded' : ''}`}>▼</span>
              </div>
              {expandedFaqs[6] && (
                <p>Yes, all our courses are available in both online and offline modes. You can choose the mode that suits you best.</p>
              )}
            </div>

            <div className="seed-faq-item" onClick={() => setExpandedFaqs(prev => ({ ...prev, 7: !prev[7] }))}>
              <div className="seed-faq-header">
                <h3>Do you provide certification after course completion?</h3>
                <span className={`seed-faq-arrow ${expandedFaqs[7] ? 'expanded' : ''}`}>▼</span>
              </div>
              {expandedFaqs[7] && (
                <p>Yes, we provide industry-recognized certification upon successful completion of the course.</p>
              )}
            </div>

            <div className="seed-faq-item" onClick={() => setExpandedFaqs(prev => ({ ...prev, 8: !prev[8] }))}>
              <div className="seed-faq-header">
                <h3>What is the training methodology?</h3>
                <span className={`seed-faq-arrow ${expandedFaqs[8] ? 'expanded' : ''}`}>▼</span>
              </div>
              {expandedFaqs[8] && (
                <p>Our training methodology includes hands-on practice, real-world projects, and mentoring by industry experts.</p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Footer Section */}
      <footer className="homepage-footer">
        <div className="seed-footer-container">
          <div className="seed-footer-grid">
            <div className="seed-footer-col">
              <h4>Contact Us</h4>
              <div className="seed-contact-info">
                <h5>Coimbatore:</h5>
                <p>SEED Innovating Technologies and Educational Services (SEED-IT)</p>
                <p>CHIL SEZ IT Park (Special Economic Zone),</p>
                <p>Saravanampatti, Coimbatore - 641035</p>
                <p><strong>Phone:</strong> +91-94427 30135</p>
                <p><strong>Email:</strong> seed.skillup@gmail.com</p>
              </div>
            </div>

            <div className="seed-footer-col">
              <h4>Quick Links</h4>
              <ul>
                <li><a href="#about" onClick={(e) => {
                  e.preventDefault();
                  document.getElementById('about').scrollIntoView({ behavior: 'smooth' });
                }}>About Us</a></li>
                <li><a href="#courses" onClick={(e) => {
                  e.preventDefault();
                  document.querySelector('.seed-courses-section').scrollIntoView({ behavior: 'smooth' });
                }}>Our Courses</a></li>
                <li><a href="#schedule" onClick={(e) => {
                  e.preventDefault();
                  document.getElementById('schedule').scrollIntoView({ behavior: 'smooth' });
                }}>Training Schedule</a></li>
                <li><a href="#testimonials" onClick={(e) => {
                  e.preventDefault();
                  document.getElementById('testimonials').scrollIntoView({ behavior: 'smooth' });
                }}>Placements</a></li>
                <li><a href="#about" onClick={(e) => {
                  e.preventDefault();
                  document.getElementById('about').scrollIntoView({ behavior: 'smooth' });
                }}>Corporate Training</a></li>
              </ul>
            </div>

            <div className="seed-footer-col">
              <h4>Training Modes</h4>
              <ul>
                <li>Online Live Classes</li>
                <li>Classroom Training</li>
                <li>Hybrid Learning</li>
                <li>Weekend Batches</li>
                <li>Corporate Training</li>
              </ul>
            </div>

            <div className="seed-footer-col">
              <h4>Follow Us</h4>
              <div className="seed-social-links">
                <a href="https://facebook.com" target="_blank" rel="noopener noreferrer">Facebook</a>
                <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer">LinkedIn</a>
                <a href="https://instagram.com/seed_skillup" target="_blank" rel="noopener noreferrer">Instagram</a>
                <a href="https://twitter.com" target="_blank" rel="noopener noreferrer">Twitter</a>
              </div>
            </div>
          </div>

          <div className="seed-footer-bottom">
            <p>&copy; 2023-2025 SEED Innovating Technologies and Educational Services (SEED-IT). All Rights Reserved.</p>
            <div className="seed-footer-links">
              <a href="#" onClick={(e) => {
                e.preventDefault();
                document.querySelector('.homepage-container').scrollIntoView({ behavior: 'smooth' });
              }}>Back to Top</a>
              <a href="#faq" onClick={(e) => {
                e.preventDefault();
                document.getElementById('faq').scrollIntoView({ behavior: 'smooth' });
              }}>FAQ</a>
              <a href="#news" onClick={(e) => {
                e.preventDefault();
                document.getElementById('news').scrollIntoView({ behavior: 'smooth' });
              }}>News</a>
            </div>
            <p style={{ fontSize: '0.8rem', color: '#999', marginTop: '10px' }}>Version {APP_VERSION}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default HomePage;
